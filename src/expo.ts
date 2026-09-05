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
