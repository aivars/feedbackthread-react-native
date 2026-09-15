import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { FeedbackThreadClient } from './core/client.js';
import { FeedbackThreadError } from './core/errors.js';
import type { FeedbackThreadClientOptions } from './core/types.js';

export type ExpoFeedbackThreadOptions = Omit<FeedbackThreadClientOptions, 'platform' | 'storage' | 'generateId'>;

/** Expo Go-compatible defaults. Only the public SDK project key belongs in app code. */
export function createExpoFeedbackThreadClient(options: ExpoFeedbackThreadOptions): FeedbackThreadClient {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new FeedbackThreadError('The Expo SDK beta supports iOS and Android.', 'configuration');
  return new FeedbackThreadClient({ ...options, platform: Platform.OS, storage: AsyncStorage, generateId: () => Crypto.randomUUID() });
}

import { FeedbackThreadConversations } from './core/conversations.js';

/** Pass `import * as SecureStore from 'expo-secure-store'`. Tokens never enter AsyncStorage. */
export function createExpoFeedbackThreadConversations(
  client: FeedbackThreadClient,
  secureStore: {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
    deleteItemAsync(key: string): Promise<void>;
  },
  accountScope = 'guest',
): FeedbackThreadConversations {
  return new FeedbackThreadConversations(client, {
    getItem: key => secureStore.getItemAsync(key),
    setItem: (key, value) => secureStore.setItemAsync(key, value),
    removeItem: key => secureStore.deleteItemAsync(key),
  }, accountScope);
}

/** Pass the result of Notifications.getDevicePushTokenAsync() in a native development/release build. */
export function registerExpoFeedbackThreadDevice(
  conversations: FeedbackThreadConversations,
  token: { type: string; data: string | object },
): Promise<unknown> {
  if (typeof token.data !== 'string' || !['ios', 'android'].includes(token.type)) throw new FeedbackThreadError('Expected a native APNs or FCM device token.', 'validation');
  return conversations.registerDevice(token.data, token.type === 'ios' ? 'apns' : 'fcm');
}
