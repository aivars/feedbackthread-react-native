import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackThreadClient, FeedbackThreadConversations } from '../src/core/index.js';
import type { ConversationCredentialStore } from '../src/core/conversations.js';
const session = { customerId: 'guest-id', externalUserId: 'ft-guest:guest-id', token: 'a'.repeat(72) };
const route = { feedbackId: 'FDBK-test01', audience: 'private' as const };
function setup(fetcher: typeof fetch, values = new Map<string,string>(), account = 'guest') {
  const storage: ConversationCredentialStore = { async getItem(k) { return values.get(k) ?? null; }, async setItem(k,v) { values.set(k,v); }, async removeItem(k) { values.delete(k); } };
  const client = new FeedbackThreadClient({ projectKey: 'test', platform: 'ios', generateId: () => 'local-id', storage, fetch: fetcher, maxRetries: 0 });
  return { manager: new FeedbackThreadConversations(client,storage,account), values };
}
test('concurrent preparation creates one secure session and persists it across managers', async () => {
  let creates=0;
  const fetcher: typeof fetch=async (url,init) => {
    if(String(url).endsWith('/chat/session')) { creates++; return Response.json(session); }
    assert.equal(new Headers(init?.headers).get('X-FeedbackThread-Customer'),session.token);
    return Response.json({ messages: [] });
  };
  const {manager,values}=setup(fetcher);
  await Promise.all([manager.prepare(),manager.prepare(),manager.history(route)]);
  await setup(fetcher,values).manager.prepare();
  assert.equal(creates,1); assert.equal([...values.keys()].filter(k=>k.startsWith("ft.chat.")).length,1);
  await setup(fetcher,values,'account-b').manager.prepare(); assert.equal(creates,2);
});
test('logout racing session creation revokes the issued token and clears credentials', async () => {
  let resolve!: (response: Response) => void;
  let started!: () => void; const beginning=new Promise<void>(r=>started=r);
  let revoked=false;
  const {manager,values}=setup(async (_url,init) => {
    if(init?.method==='DELETE') { revoked=true; assert.equal(new Headers(init.headers).get('X-FeedbackThread-Customer'),session.token); return Response.json({ok:true}); }
    started(); return new Promise<Response>(r=>resolve=r);
  });
  const preparing=manager.prepare(); const rejected=assert.rejects(preparing);
  await beginning; const loggingOut=manager.logout(); resolve(Response.json(session));
  await Promise.all([rejected,loggingOut]); assert.equal(revoked,true); assert.equal([...values.keys()].filter(k=>k.startsWith("ft.chat.")).length,0);
  await assert.rejects(manager.history(route));
  manager.open(route); assert.equal(manager.getSnapshot().route,null);
});
test('in-flight private history is discarded after logout',async()=>{
  let resolve!: (response: Response)=>void; let started!:()=>void; const beginning=new Promise<void>(r=>started=r);
  const {manager}=setup(async(url,init)=>{
    if(String(url).endsWith('/session')) return Response.json(init?.method==='POST'?session:{ok:true});
    started(); return new Promise<Response>(r=>resolve=r);
  });
  await manager.prepare(); const history=manager.history(route); const rejected=assert.rejects(history);
  await beginning; await manager.logout(); resolve(Response.json({messages:[{body:'private'}]})); await rejected;
});
test('explicit resend preserves the client id and does not depend on an inbox refresh', async()=>{
  const ids:string[]=[];
  const {manager}=setup(async(url,init)=>{
    if(String(url).endsWith('/session')) return Response.json(session);
    assert.ok(String(url).endsWith('/messages')); ids.push(JSON.parse(String(init?.body)).clientId);
    return ids.length===1?Response.json({error:{message:'temporary'}},{status:503}):Response.json({id:'message-id',state:'posted'});
  });
  await assert.rejects(manager.send(route,'Reply','stable-id'));
  await manager.send(route,'Reply','stable-id'); assert.deepEqual(ids,['stable-id','stable-id']);
});
test('secure-store failure prevents conversation use rather than silently changing identity',async()=>{
  let calls=0; const {manager}=setup(async()=>{calls++;return Response.json(session)});
  const broken=new FeedbackThreadConversations(manager.client,{async getItem(){throw Error('locked')},async setItem(){},async removeItem(){}});
  await assert.rejects(broken.prepare(),/locked/); assert.equal(calls,0);
});
test('notification routes are validated and never treated as authorization',()=>{
  const {manager}=setup(async()=>Response.json(session));
  assert.equal(manager.handleNotification({feedbackThread:{feedbackId:'../../private',audience:'private'}}),false);
  assert.equal(manager.handleNotification({feedbackThread:JSON.stringify(route)}),true);
  assert.deepEqual(manager.getSnapshot().route,route);
});
test('logout clears visible state even if secure storage is unavailable',async()=>{
  const base=setup(async()=>Response.json(session)).manager.client;
  const manager=new FeedbackThreadConversations(base,{async getItem(){throw Error('locked')},async setItem(){},async removeItem(){}});
  manager.open(route);
  await assert.rejects(manager.logout(),/locked/);
  assert.equal(manager.getSnapshot().route,null);
  assert.deepEqual(manager.getSnapshot().inbox,[]);
});
test('logout treats an already revoked credential as success',async()=>{
 const {manager}=setup(async(_url,init)=>init?.method==='DELETE'?Response.json({error:{message:'Revoked'}},{status:401}):Response.json(session));
 await manager.prepare(); await manager.logout(); await manager.logout();
 assert.equal(manager.getSnapshot().route,null);
});
