import * as Haptics from 'expo-haptics';

import { getPrefs } from './prefs';

const on = () => getPrefs().haptics && process.env.EXPO_OS === 'ios';

export const haptic = {
  tap: () => on() && Haptics.selectionAsync(),
  light: () => on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  rigid: () => on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  success: () => on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};
