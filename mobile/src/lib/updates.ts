import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

/**
 * Over-the-air updates (EAS Update). Release builds check for a new JS bundle on every launch and
 * download it in the background; it applies on the next launch, or right away from Settings.
 * Ship one with: `npx eas-cli@latest update --channel production --message "…"` from mobile/.
 */

export const updatesEnabled = Updates.isEnabled;
export { useUpdates } from 'expo-updates';

/** A short description of the code that's running: the embedded build or a downloaded update. */
export function currentRelease() {
  if (!Updates.isEnabled) return 'Development build';
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return 'Built-in version';
  const when = Updates.createdAt ? Updates.createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  return `Update ${Updates.updateId.slice(0, 8)}${when ? ` · ${when}` : ''}`;
}

export async function restartToUpdate() {
  await Updates.reloadAsync();
}

/** Manual "Check for updates": downloads a new update if there is one and offers to restart. */
export async function checkForUpdates() {
  if (!Updates.isEnabled) {
    Alert.alert('Updates', 'Over-the-air updates work in TestFlight and App Store builds, not in development.');
    return;
  }
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      Alert.alert('You’re up to date', 'This is the latest version of KnowDeck.');
      return;
    }
    await Updates.fetchUpdateAsync();
    Alert.alert('Update ready', 'Restart KnowDeck to use the new version.', [
      { text: 'Later', style: 'cancel' },
      { text: 'Restart', onPress: () => void restartToUpdate() },
    ]);
  } catch (e) {
    Alert.alert('Couldn’t check for updates', e instanceof Error ? e.message : String(e));
  }
}
