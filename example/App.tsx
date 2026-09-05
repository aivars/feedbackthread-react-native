import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { FeedbackThreadBoard } from 'feedbackthread-react-native';
import { createExpoFeedbackThreadClient } from 'feedbackthread-react-native/expo';
import { demoFetch, setOffline } from './demo';

const projectKey = process.env.EXPO_PUBLIC_FEEDBACKTHREAD_PROJECT_KEY;
const demo = !projectKey;

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [offline, changeOffline] = useState(false);
  const client = useMemo(() => createExpoFeedbackThreadClient({
    projectKey: projectKey || 'demo-public-key',
    appVersion: 'Expo demo 1.0.0',
    externalUserId: signedIn ? 'sdk-demo-tester' : null,
    ...(demo ? { fetch: demoFetch } : {}),
  }), [signedIn]);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1 }}>
    <StatusBar style="auto" />
    <View style={{ padding: 12, backgroundColor: '#ede8ff', gap: 8 }}>
      <Text style={{ color: '#33235c', fontWeight: '600' }}>{demo ? 'Demo · local sample data' : 'Connected to your FeedbackThread project'}</Text>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        <Pressable accessibilityRole="button" onPress={() => setSignedIn((value) => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: '#33235c' }}>{signedIn ? 'Sign out tester' : 'Sign in tester'}</Text>
        </Pressable>
        {demo ? <Pressable accessibilityRole="button" onPress={() => { setOffline(!offline); changeOffline(!offline); }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: '#33235c' }}>{offline ? 'Restore connection' : 'Simulate offline'}</Text>
        </Pressable> : null}
      </View>
    </View>
    <FeedbackThreadBoard client={client} />
  </SafeAreaView></SafeAreaProvider>;
}
