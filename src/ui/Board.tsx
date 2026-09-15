import { useConversations, useConversationState } from './Conversations.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import type { FeedbackKind, FeedbackRequest, RequestStage } from '../core/types.js';
import { requestStage } from '../core/status.js';
import { FeedbackThreadFeedbackForm } from './FeedbackForm.js';
import { FeedbackThreadMyRequests } from './MyRequests.js';
import { Button, ErrorNotice, Loading, Status, styles, useResource, useAndroidBack, type SurfaceProps } from './shared.js';
import { stringsFor } from './strings.js';
import { useFeedbackTheme } from './theme.js';

export interface FeedbackThreadBoardProps extends SurfaceProps {
  onUnreadCountChange?: (count: number) => void;
}
type Route = { screen: 'board' } | { screen: 'detail'; id: string } | { screen: 'form'; kind: FeedbackKind };

export function FeedbackThreadBoard(props: FeedbackThreadBoardProps) {
  const candidate = useConversations(props.conversations);
  const conversations = candidate?.client.conversationNamespace === props.client.conversationNamespace ? candidate : undefined;
  const client = conversations?.client ?? props.client;
  return <Board key={client.instanceId} {...props} client={client} conversations={conversations} />;
}

function Board(props: FeedbackThreadBoardProps) {
  const { client, onClose, onError, onUnreadCountChange, conversations } = props;
  const discussion = useConversationState(conversations);
  const theme = useFeedbackTheme(props.theme);
  const strings = stringsFor(props.strings);
  const [route, setRoute] = useState<Route>({ screen: 'board' });
  const [tab, setTab] = useState<'board' | 'mine'>('board');
  const [filter, setFilter] = useState<RequestStage | 'all'>('all');
  const load = useCallback((signal: AbortSignal) => client.requests({ signal }), [client]);
  const resource = useResource(load, onError);
  const [unread, setUnread] = useState(0);
  const unreadCallback = useRef(onUnreadCountChange);
  const errorCallback = useRef(onError);
  unreadCallback.current = onUnreadCountChange; errorCallback.current = onError;
  useEffect(() => {
    const controller = new AbortController();
    void client.myUpdates({ signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) { setUnread(value.unreadCount); unreadCallback.current?.(value.unreadCount); }
    }).catch((cause: unknown) => {
      // A failed badge fetch does not replace a successfully loaded board.
      if (!controller.signal.aborted) errorCallback.current?.(cause instanceof Error ? cause : new Error('Update count failed.'));
    });
    return () => controller.abort();
  }, [client]);
  const [voting, setVoting] = useState<Set<string>>(new Set());
  const activeVotes = useRef(new Map<string, AbortController>());
  const [voteError, setVoteError] = useState<unknown>();
  useEffect(() => () => { for (const controller of activeVotes.current.values()) controller.abort(); }, []);

  async function vote(item: FeedbackRequest) {
    if (activeVotes.current.has(item.id)) return;
    const controller = new AbortController(); activeVotes.current.set(item.id, controller);
    setVoting(new Set(activeVotes.current.keys())); setVoteError(undefined);
    try {
      const updated = await client.setVote(item.id, !item.voted, { signal: controller.signal });
      if (!controller.signal.aborted) resource.setData((data) => data ? { ...data, requests: data.requests.map((request) => request.id === item.id ? { ...request, votes: updated.votes, voted: updated.voted } : request) } : data);
    } catch (cause) {
      if (!controller.signal.aborted) { setVoteError(cause); onError?.(cause instanceof Error ? cause : new Error('Vote failed.')); }
    } finally {
      activeVotes.current.delete(item.id);
      if (!controller.signal.aborted) setVoting(new Set(activeVotes.current.keys()));
    }
  }

  const back = () => setRoute({ screen: 'board' });
  useAndroidBack(route.screen === 'form' ? undefined : route.screen === 'detail' ? back : tab === 'mine' ? () => setTab('board') : onClose);
  if (route.screen === 'form') return <FeedbackThreadFeedbackForm {...props} kind={route.kind} onClose={() => { back(); resource.refresh(); }} />;
  const selected = route.screen === 'detail' ? resource.data?.requests.find((request) => request.id === route.id) : undefined;
  if (selected) return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
    <Button label={strings.back} onPress={back} secondary theme={theme} />
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{selected.title}</Text>
    <Status status={selected.status} version={selected.shippedInVersion} strings={strings} theme={theme} />
    <Text selectable style={[styles.body, { color: theme.text }]}>{selected.description}</Text>
    {conversations && discussion.settings?.publicCommentsEnabled ? <Button label={strings.comments} theme={theme} secondary onPress={() => conversations.open({ feedbackId: selected.id, audience: 'public' })} /> : null}
    <ErrorNotice error={voteError} strings={strings} theme={theme} />
    <Button label={`${selected.voted ? strings.removeVote : strings.vote} · ${selected.votes}`} theme={theme} secondary={selected.voted} disabled={voting.has(selected.id)} onPress={() => void vote(selected)} />
  </ScrollView>;

  const all = resource.data?.requests ?? [];
  const filtered = filter === 'all' ? all : all.filter((item) => requestStage(item.status) === filter);
  const filters = ['all', 'review', 'planned', 'progress', 'completed'] as const;

  return <View style={[styles.screen, { backgroundColor: theme.background }]}>
    <View style={styles.header}>
      {onClose ? <Button label={strings.close} onPress={onClose} secondary theme={theme} /> : null}
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{strings.board}</Text>
      <Text style={[styles.subtitle, { color: theme.secondaryText }]}>{strings.subtitle}</Text>
    </View>
    <View style={styles.tabs}>
      {(['board', 'mine'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)}
        style={[styles.tab, { borderColor: tab === value ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
        <Text style={[styles.buttonText, { color: tab === value ? theme.accent : theme.text }]}>{value === 'board' ? strings.boardTab : `${strings.myRequests}${unread ? ` (${unread})` : ''}`}</Text>
      </Pressable>)}
    </View>
    {tab === 'mine' ? <FeedbackThreadMyRequests {...props} onClose={undefined} onUnreadCountChange={(value) => { setUnread(value); unreadCallback.current?.(value); }} /> :
      <FlatList data={filtered} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} refreshing={resource.loading && Boolean(resource.data)} onRefresh={resource.refresh}
        ListHeaderComponent={<View style={{ gap: 12, marginBottom: 16 }}>
          <View style={styles.row}>
            <Button label={strings.suggest} theme={theme} onPress={() => setRoute({ screen: 'form', kind: 'Requests' })} />
            <Button label={strings.reportBug} theme={theme} secondary onPress={() => setRoute({ screen: 'form', kind: 'Bugs' })} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {filters.map((value) => <Button key={value} label={`${strings[value]} (${value === 'all' ? all.length : all.filter((item) => requestStage(item.status) === value).length})`} theme={theme} secondary={filter !== value} onPress={() => setFilter(value)} />)}
          </ScrollView>
          <ErrorNotice error={resource.error} retry={resource.refresh} theme={theme} strings={strings} />
          <ErrorNotice error={voteError} theme={theme} strings={strings} />
        </View>}
        ListEmptyComponent={resource.loading ? <Loading strings={strings} theme={theme} /> : resource.error ? null : <Text style={[styles.body, { color: theme.secondaryText }]}>{strings.empty}</Text>}
        renderItem={({ item }) => <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => { setVoteError(undefined); setRoute({ screen: 'detail', id: item.id }); }} style={{ gap: 8, minHeight: 44 }}>
            <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
            <Text numberOfLines={2} style={[styles.body, { color: theme.secondaryText }]}>{item.description}</Text>
          </Pressable>
          <Status status={item.status} version={item.shippedInVersion} strings={strings} theme={theme} />
          {item.target === 'watchos' ? <Text style={{ color: theme.secondaryText }}>Apple Watch</Text> : null}
          <Button label={`${item.voted ? strings.removeVote : strings.vote} · ${item.votes}`} theme={theme} secondary={item.voted} disabled={voting.has(item.id)} onPress={() => void vote(item)} />
        </View>} />}
  </View>;
}
