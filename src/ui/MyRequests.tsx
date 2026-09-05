import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Button, ErrorNotice, Loading, Status, styles, useResource, type SurfaceProps } from './shared.js';
import { stringsFor } from './strings.js';
import { useFeedbackTheme } from './theme.js';

export interface FeedbackThreadMyRequestsProps extends SurfaceProps {
  onUnreadCountChange?: (count: number) => void;
}

export function FeedbackThreadMyRequests(props: FeedbackThreadMyRequestsProps) {
  return <MyRequests key={props.client.instanceId} {...props} />;
}

function MyRequests({ client, onClose, onError, onUnreadCountChange, theme: overrides, strings: labels }: FeedbackThreadMyRequestsProps) {
  const theme = useFeedbackTheme(overrides);
  const strings = stringsFor(labels);
  const load = useCallback(async (signal: AbortSignal) => {
    const [requests, updates] = await Promise.all([client.myRequests({ signal }), client.myUpdates({ signal })]);
    return { requests: requests.requests, ...updates };
  }, [client]);
  const resource = useResource(load, onError);
  const callback = useRef(onUnreadCountChange);
  callback.current = onUnreadCountChange;
  useEffect(() => { if (resource.data) callback.current?.(resource.data.unreadCount); }, [resource.data?.unreadCount]);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<unknown>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function markRead() {
    if (controller.current || !resource.data?.updates.length) return;
    const active = new AbortController(); controller.current = active;
    setMarking(true); setError(undefined);
    try {
      // Acknowledge exactly the fetched updates; never consume a newly arriving
      // update the user hasn't had an opportunity to see.
      const ids = resource.data.updates.map((update) => update.id);
      for (let i = 0; i < ids.length; i += 200) await client.acknowledgeUpdates(ids.slice(i, i + 200), { signal: active.signal });
      if (!active.signal.aborted) resource.refresh();
    } catch (cause) {
      if (!active.signal.aborted) { setError(cause); onError?.(cause instanceof Error ? cause : new Error('Acknowledgement failed.')); }
    } finally {
      if (!active.signal.aborted) setMarking(false);
      controller.current = null;
    }
  }

  return <View style={[styles.screen, { backgroundColor: theme.background }]}>
    <FlatList data={resource.data?.requests ?? []} keyExtractor={(item) => item.id} contentContainerStyle={styles.content}
      refreshing={resource.loading && Boolean(resource.data)} onRefresh={resource.refresh}
      ListHeaderComponent={<View style={{ gap: 12 }}>
        {onClose ? <Button label={strings.back} onPress={onClose} secondary theme={theme} /> : null}
        <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{strings.myRequests}</Text>
        <ErrorNotice error={resource.error} retry={resource.refresh} strings={strings} theme={theme} />
        <ErrorNotice error={error} retry={() => void markRead()} strings={strings} theme={theme} />
        {resource.data?.unreadCount ? <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{strings.newUpdates} · {resource.data.unreadCount}</Text>
          {resource.data.updates.map((update) => <Text key={update.id} style={[styles.body, { color: theme.text }]}>{update.title} · {strings.shipped} {update.shippedVersion}</Text>)}
          <Button label={marking ? strings.markingRead : strings.markRead} onPress={() => void markRead()} disabled={marking} theme={theme} />
        </View> : null}
      </View>}
      ListEmptyComponent={resource.loading ? <Loading theme={theme} strings={strings} /> : resource.error ? null : <Text style={[styles.body, { color: theme.secondaryText }]}>{strings.emptyMine}</Text>}
      renderItem={({ item }) => <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
        <Status status={item.status} version={item.shippedInVersion} theme={theme} strings={strings} />
      </View>} />
  </View>;
}
