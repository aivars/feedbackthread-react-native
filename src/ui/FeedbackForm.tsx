import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import type { FeedbackKind, Submission, SubmissionResult } from '../core/types.js';
import { FeedbackThreadError } from '../core/errors.js';
import { Button, ErrorNotice, styles, useAndroidBack, type SurfaceProps } from './shared.js';
import { stringsFor } from './strings.js';
import { useFeedbackTheme } from './theme.js';

export interface FeedbackThreadFeedbackFormProps extends SurfaceProps {
  kind?: FeedbackKind;
  onSubmitted?: (result: SubmissionResult) => void;
}

export function FeedbackThreadFeedbackForm(props: FeedbackThreadFeedbackFormProps) {
  return <FeedbackForm key={`${props.client.instanceId}:${props.kind ?? 'Requests'}`} {...props} />;
}

function FeedbackForm({ client, kind = 'Requests', theme: overrides, strings: labels, onClose, onSubmitted, onError }: FeedbackThreadFeedbackFormProps) {
  const theme = useFeedbackTheme(overrides);
  const strings = stringsFor(labels);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<unknown>();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SubmissionResult>();
  const pending = useRef<{ signature: string; key: string; submission: Submission } | undefined>(undefined);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useAndroidBack(onClose, sending);

  async function send() {
    if (active.current) return;
    if (!title.trim() || !description.trim()) { setError(new FeedbackThreadError(strings.required, 'validation')); return; }
    const controller = new AbortController();
    active.current = controller;
    setSending(true); setError(undefined);
    try {
      const submission = { kind, title: title.trim(), text: description.trim() };
      const signature = JSON.stringify(submission);
      if (pending.current?.signature !== signature) pending.current = { signature, key: client.createSubmissionKey(), submission };
      const response = await client.submit(pending.current.submission, { idempotencyKey: pending.current.key, signal: controller.signal });
      if (!controller.signal.aborted) { setResult(response); onSubmitted?.(response); }
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause); onError?.(cause instanceof Error ? cause : new Error('Feedback submission failed.')); }
    } finally {
      if (!controller.signal.aborted) setSending(false);
      active.current = null;
    }
  }

  if (result) return <View style={[styles.screen, styles.content, { backgroundColor: theme.background }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{strings.thanks}</Text>
    <Text style={[styles.body, { color: theme.secondaryText }]}>{strings.submittedMessage}</Text>
    {onClose ? <Button label={strings.done} theme={theme} onPress={onClose} /> : null}
  </View>;

  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {onClose ? <Button label={strings.back} theme={theme} secondary onPress={onClose} disabled={sending} /> : null}
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{kind === 'Bugs' ? strings.reportBug : strings.suggest}</Text>
      <View style={styles.field}>
        <Text style={[styles.title, { color: theme.text }]}>{strings.title}</Text>
        <TextInput testID="feedback-title" accessibilityLabel={strings.title} value={title} onChangeText={setTitle} maxLength={160} editable={!sending}
          placeholder={kind === 'Bugs' ? strings.bugTitlePlaceholder : strings.titlePlaceholder} placeholderTextColor={theme.secondaryText}
          style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]} />
      </View>
      <View style={styles.field}>
        <Text style={[styles.title, { color: theme.text }]}>{strings.description}</Text>
        <TextInput testID="feedback-description" accessibilityLabel={strings.description} value={description} onChangeText={setDescription} maxLength={8000} editable={!sending} multiline textAlignVertical="top"
          placeholder={strings.descriptionPlaceholder} placeholderTextColor={theme.secondaryText}
          style={[styles.input, { minHeight: 160, color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]} />
      </View>
      <ErrorNotice error={error} strings={strings} theme={theme} />
      <Button testID="feedback-submit" label={sending ? strings.sending : strings.send} onPress={() => void send()} disabled={sending} theme={theme} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
