import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Text, TextInput, View, type ViewToken } from 'react-native';
import { FeedbackThreadConversations, type ConversationHistory, type ConversationMessage, type ConversationRoute } from '../core/conversations.js';
import { Button, ErrorNotice, styles, type SurfaceProps, useAndroidBack } from './shared.js';
import { stringsFor } from './strings.js';
import { useFeedbackTheme } from './theme.js';
const Context = createContext<FeedbackThreadConversations | undefined>(undefined);
export function useConversations(explicit?: FeedbackThreadConversations) { const context = useContext(Context); return explicit ?? context; }
const emptyState = { settings: null, revision: 0, unreadCount: 0, inbox: [], route: null, error: null };
const noSubscribe = () => () => {};
const emptySnapshot = () => emptyState;
export function useConversationState(conversations?: FeedbackThreadConversations) { return useSyncExternalStore(conversations?.subscribe ?? noSubscribe, conversations?.getSnapshot ?? emptySnapshot); }

/** Place once at the app root. Host retains ownership of push permissions and taps. */
export function FeedbackThreadConversationProvider({ conversations, children, ...appearance }: { conversations: FeedbackThreadConversations; children: ReactNode } & Pick<SurfaceProps, 'theme' | 'strings'>) {
  const state = useConversationState(conversations); const theme = useFeedbackTheme(appearance.theme); const strings = stringsFor(appearance.strings);
  useEffect(() => {
    let stop: (() => void) | undefined;
    const update = (status: string) => { stop?.(); stop = status === 'active' ? conversations.startLive() : undefined; };
    update(AppState.currentState);
    const listener = AppState.addEventListener('change', update);
    return () => { listener.remove(); stop?.(); };
  }, [conversations]);
  const unread = state.inbox.find(item => item.unreadCount > 0);
  return <Context.Provider value={conversations}>
    <View key={conversations.client.instanceId} style={{ flex: 1 }}>{children}</View>
    {unread && !state.route ? <View style={{ padding: 12, backgroundColor: theme.surface }} accessibilityLiveRegion="polite"><Button theme={theme} label={`${strings.newReply} (${state.unreadCount})`} onPress={() => conversations.open(unread)} /></View> : null}
    <Modal visible={state.route !== null} onRequestClose={() => conversations.open(null)}>
      {state.route ? <FeedbackThreadConversationView key={`${conversations.client.instanceId}:${state.route.feedbackId}:${state.route.audience}`} client={conversations.client} conversations={conversations} route={state.route} onClose={() => conversations.open(null)} {...appearance} /> : null}
    </Modal>
  </Context.Provider>;
}

export function FeedbackThreadConversationView(props: SurfaceProps & { conversations: FeedbackThreadConversations; route: ConversationRoute }) {
  return <ConversationContent key={`${props.conversations.client.instanceId}:${props.route.feedbackId}:${props.route.audience}`} {...props} />;
}
function ConversationContent(props: SurfaceProps & { conversations: FeedbackThreadConversations; route: ConversationRoute }) {
  const { conversations, route, onClose } = props;
  const state = useConversationState(conversations); const theme = useFeedbackTheme(props.theme); const strings = stringsFor(props.strings);
  const [history, setHistory] = useState<ConversationHistory>(); const [earlier, setEarlier] = useState<ConversationMessage[]>([]);
  const [before, setBefore] = useState<number | null>(null); const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0); const pending = useRef({ body: '', id: '' }); const mounted = useRef(true); const readSeq = useRef(0);
  const controller = useRef(new AbortController());
  const actionActive = useRef(false);
  const pages = useRef(1);
  useEffect(() => { mounted.current = true; controller.current = new AbortController(); return () => { mounted.current = false; controller.current.abort(); }; }, []);
  useAndroidBack(onClose);
  const refresh = () => setRevision(n => n + 1);
  useEffect(() => {
    const active = new AbortController();
    void (async () => {
      const latest = await conversations.history(route, undefined, { signal: active.signal });
      let cursor = latest.nextBefore; const older: ConversationMessage[] = [];
      for (let page = 1; page < pages.current && cursor; page++) {
        const value = await conversations.history(route, cursor, { signal: active.signal });
        older.push(...value.messages); cursor = value.nextBefore;
      }
      if (!active.signal.aborted) { setHistory(latest); setEarlier(older); setBefore(cursor); setError(undefined); }
    })().catch(cause => { if (!active.signal.aborted) { setError(cause); setHistory(undefined); setEarlier([]); pages.current = 1; } });
    return () => active.abort();
  }, [conversations, route.feedbackId, route.audience, state.revision, revision]);
  async function action(work: () => Promise<unknown>) {
    if (actionActive.current) return; actionActive.current = true; setBusy(true); setError(undefined);
    try { await work(); if (mounted.current) { refresh(); void conversations.refresh().catch(() => {}); } }
    catch (cause) { if (mounted.current) setError(cause); }
    finally { actionActive.current = false; if (mounted.current) setBusy(false); }
  }
  async function send() {
    const body = draft.trim(); if (!body) return;
    if (pending.current.body !== body) pending.current = { body, id: conversations.client.createSubmissionKey() };
    await action(async () => { await conversations.send(route, body, pending.current.id, { signal: controller.current.signal }); if (mounted.current) { setDraft(''); pending.current = { body: '', id: '' }; } });
  }
  const viewable = useRef(({ viewableItems }: { viewableItems: ViewToken<ConversationMessage>[] }) => {
    if (AppState.currentState !== 'active') return;
    const seq = Math.max(0, ...viewableItems.filter(v => v.isViewable).map(v => v.item.seq));
    if (seq <= readSeq.current) return;
    const previous = readSeq.current; readSeq.current = seq;
    void conversations.markRead(route, seq, { signal: controller.current.signal }).then(() => conversations.refresh()).catch(() => { readSeq.current = previous; });
  }).current;
  if (route.audience === 'public' && state.settings?.publicCommentsEnabled === false) return <View style={styles.content}><Button label={strings.back} theme={theme} onPress={() => onClose?.()} /><Text style={{ color: theme.text }}>{strings.commentsDisabled}</Text></View>;
  const messages = [...new Map([...earlier, ...(history?.messages ?? [])].map(m => [m.id, m])).values()].sort((a,b) => a.seq - b.seq);
  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.content}>
      <Button label={strings.back} theme={theme} secondary onPress={() => onClose?.()} />
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{route.audience === 'private' ? strings.replies : strings.comments}</Text>
      <Text style={{ color: theme.secondaryText }}>{route.audience === 'private' ? strings.privateAudience : strings.publicAudience}</Text>
      <ErrorNotice error={error} retry={refresh} theme={theme} strings={strings} />
      {history ? <Button label={history.following ? strings.mute : strings.notifyMe} theme={theme} secondary disabled={busy} onPress={() => void action(() => conversations.follow(route, !history.following))} /> : null}
    </View>
    <FlatList data={messages} keyExtractor={m => m.id} contentContainerStyle={styles.content} onViewableItemsChanged={viewable} viewabilityConfig={{ itemVisiblePercentThreshold: 80, minimumViewTime: 500 }}
      refreshing={false} onRefresh={refresh}
      ListHeaderComponent={before ? <Button label={strings.earlier} theme={theme} secondary disabled={busy} onPress={() => void action(async () => { const value = await conversations.history(route, before); if (mounted.current) { pages.current++; setEarlier(old => [...value.messages, ...old]); setBefore(value.nextBefore); } })} /> : null}
      ListEmptyComponent={<Text style={{ color: theme.secondaryText }}>{history ? strings.noMessages : strings.loading}</Text>}
      renderItem={({ item }) => <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{item.mine ? strings.you : item.authorRole === 'developer' ? strings.developer : strings.appUser}</Text>
        <Text selectable style={[styles.body, { color: theme.text }]}>{item.deletedAt ? strings.messageRemoved : item.body}</Text>
        {item.mine ? <Text style={{ color: theme.secondaryText }}>{(history?.otherReadSeq ?? 0) >= item.seq ? strings.read : strings.posted}</Text> : null}
        {item.mine && !item.deletedAt ? <Button theme={theme} secondary label={strings.removeMessage} onPress={() => Alert.alert(strings.removeMessage, '', [{ text: strings.cancel, style: 'cancel' }, { text: strings.removeMessage, style: 'destructive', onPress: () => { void action(() => conversations.remove(route, item.id)); } }])} /> : null}
      </View>} />
    <View style={styles.content}><TextInput accessibilityLabel={route.audience === 'private' ? strings.replyPlaceholder : strings.commentPlaceholder} placeholder={route.audience === 'private' ? strings.replyPlaceholder : strings.commentPlaceholder} value={draft} onChangeText={setDraft} multiline maxLength={4000} editable={!busy} style={[styles.input, { color: theme.text, borderColor: theme.border, maxHeight: 160 }]} />
      <Button theme={theme} label={busy ? strings.sending : route.audience === 'private' ? strings.sendReply : strings.postComment} disabled={busy || !history || !draft.trim()} onPress={() => void send()} />
    </View>
  </KeyboardAvoidingView>;
}
