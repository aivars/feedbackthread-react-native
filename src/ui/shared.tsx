import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { FeedbackThreadError } from '../core/errors.js';
import { requestStage } from '../core/status.js';
import type { FeedbackThreadClient } from '../core/client.js';
import type { FeedbackThreadStrings } from './strings.js';
import type { FeedbackThreadTheme } from './theme.js';

export interface SurfaceProps {
  client: FeedbackThreadClient;
  conversations?: import("../core/conversations.js").FeedbackThreadConversations;
  theme?: Partial<FeedbackThreadTheme>;
  strings?: Partial<FeedbackThreadStrings>;
  onClose?: () => void;
  /** Optional diagnostic callback; errors contain no request credentials. */
  onError?: (error: Error) => void;
}

/** Let the host navigator handle Back when this surface has no inner route. */
export function useAndroidBack(onBack?: () => void, blocked = false) {
  useEffect(() => {
    if (!onBack) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!blocked) onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, blocked]);
}

export function Button({ label, onPress, theme, disabled = false, secondary = false, testID }: {
  label: string; onPress: () => void; theme: FeedbackThreadTheme; disabled?: boolean; secondary?: boolean; testID?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? theme.surface : theme.accent, borderColor: secondary ? theme.border : theme.accent, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}>
    <Text style={[styles.buttonText, { color: secondary ? theme.text : theme.accentText }]}>{label}</Text>
  </Pressable>;
}

export function statusLabel(status: string, strings: FeedbackThreadStrings): string {
  const stage = requestStage(status);
  if (stage !== 'other') return strings[stage];
  if (['submitted', 'open'].includes(status.trim().toLowerCase())) return strings.submitted;
  if (status.trim().toLowerCase() === 'rejected') return strings.rejected;
  return status;
}

export function Status({ status, version, strings, theme }: { status: string; version?: string | null; strings: FeedbackThreadStrings; theme: FeedbackThreadTheme }) {
  return <View style={styles.statusRow}>
    <Text style={[styles.status, { color: theme.secondaryText }]}>{statusLabel(status, strings)}</Text>
    {version ? <Text style={[styles.status, { color: theme.accent }]}>{strings.shipped} {version}</Text> : null}
  </View>;
}

export function errorMessage(error: unknown, strings: FeedbackThreadStrings): string {
  if (!(error instanceof FeedbackThreadError)) return strings.unknownError;
  if (error.code === 'network') return strings.networkError;
  if (error.code === 'timeout') return strings.timeoutError;
  if (error.code === 'identity_storage') return strings.identityError;
  if (error.status === 429) return strings.rateLimitError;
  if (error.code === 'validation') return error.message;
  return strings.serviceError;
}

export function ErrorNotice({ error, retry, strings, theme }: { error: unknown; retry?: () => void; strings: FeedbackThreadStrings; theme: FeedbackThreadTheme }) {
  if (!error) return null;
  return <View style={styles.notice} accessibilityLiveRegion="polite">
    <Text accessibilityRole="alert" style={{ color: theme.danger }}>{errorMessage(error, strings)}</Text>
    {retry ? <Button label={strings.retry} onPress={retry} secondary theme={theme} /> : null}
  </View>;
}

export function Loading({ theme, strings }: { theme: FeedbackThreadTheme; strings: FeedbackThreadStrings }) {
  return <View style={styles.notice}><ActivityIndicator color={theme.accent} accessibilityLabel={strings.loading} /><Text style={{ color: theme.secondaryText }}>{strings.loading}</Text></View>;
}

/** Cancels replaced loads and discards stale responses even if a transport ignores abort. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, onError?: (error: Error) => void) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(undefined);
    void load(controller.signal).then((value) => {
      if (!controller.signal.aborted) setData(value);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) { setError(cause); onErrorRef.current?.(cause instanceof Error ? cause : new Error('Feedback request failed.')); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { data, setData, error, loading, refresh };
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 16 },
  heading: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  body: { fontSize: 16, lineHeight: 24 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  header: { gap: 12, padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 10, borderWidth: 1 },
  button: { minHeight: 46, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  buttonText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10, marginBottom: 12 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  status: { fontSize: 13, fontWeight: '500' },
  notice: { padding: 20, gap: 12, alignItems: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  field: { gap: 8 },
});
