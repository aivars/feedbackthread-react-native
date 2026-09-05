import { useColorScheme } from 'react-native';

export interface FeedbackThreadTheme {
  background: string;
  surface: string;
  text: string;
  secondaryText: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
}

const light: FeedbackThreadTheme = {
  background: '#f6f7fb', surface: '#ffffff', text: '#172033', secondaryText: '#586477',
  border: '#d9deea', accent: '#6546cf', accentText: '#ffffff', danger: '#a52535',
};
const dark: FeedbackThreadTheme = {
  background: '#10141e', surface: '#1b2231', text: '#f4f5fa', secondaryText: '#acb7cb',
  border: '#39445a', accent: '#ae96ff', accentText: '#181024', danger: '#ff9fa8',
};

export function useFeedbackTheme(overrides?: Partial<FeedbackThreadTheme>): FeedbackThreadTheme {
  return { ...(useColorScheme() === 'dark' ? dark : light), ...overrides };
}
