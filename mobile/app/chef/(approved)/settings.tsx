import React, { useState } from 'react';
import { Linking, Switch } from 'react-native';
import { router } from 'expo-router';
import { ListGroup, ListRow, Screen, Section, Txt } from '../../../src/components';
import { APP_CONFIG } from '../../../src/constants';
import { useSignOut } from '../../../src/features/authentication';
import { useToast } from '../../../src/store';
import { colors } from '../../../src/theme';

/** Chef settings. Preferences are local until a settings endpoint exists. */
export default function ChefSettings() {
  const signOut = useSignOut();
  const [prefs, setPrefs] = useState({ offers: true, reminders: true, payouts: true });
  const toggle = (k: keyof typeof prefs) => (
    <Switch value={prefs[k]} onValueChange={(v) => setPrefs((p) => ({ ...p, [k]: v }))} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.card} />
  );
  return (
    <Screen title="Settings">
      <Section title="Notifications">
        <ListGroup>
          <ListRow icon="mail-unread-outline" title="New assignment offers" right={toggle('offers')} />
          <ListRow icon="alarm-outline" title="Visit reminders" right={toggle('reminders')} />
          <ListRow icon="wallet-outline" title="Payout updates" right={toggle('payouts')} />
        </ListGroup>
      </Section>
      <Section title="Permissions">
        <ListGroup>
          <ListRow icon="location-outline" title="Location access" subtitle="Needed while travelling and for check-in" onPress={() => router.push({ pathname: '/permission-denied', params: { kind: 'location' } })} />
          <ListRow icon="camera-outline" title="Camera access" subtitle="Selfies and food photos" onPress={() => router.push({ pathname: '/permission-denied', params: { kind: 'camera' } })} />
        </ListGroup>
      </Section>
      <Section title="App">
        <ListGroup>
          <ListRow icon="language-outline" title="Language" subtitle="English" onPress={() => useToast.getState().show('More languages coming soon', 'info')} />
          <ListRow icon="help-buoy-outline" title="Contact support" onPress={() => Linking.openURL('mailto:support@delcochefs.com')} />
          <ListRow icon="log-out-outline" title="Log out" danger onPress={signOut} />
        </ListGroup>
      </Section>
      <Txt variant="caption" center>{APP_CONFIG.name} v{APP_CONFIG.version}</Txt>
    </Screen>
  );
}
