import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Txt } from '../../components';
import { APP_CONFIG } from '../../constants';
import { refreshSession } from '../../services';
import { useAuthStore } from '../../store';
import { colors, radius } from '../../theme';

/** API origin, e.g. https://host (APP_CONFIG.apiBaseUrl ends with /api/v1; photo paths start with /api/v1). */
const ORIGIN = APP_CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/, '');

/**
 * An attendance evidence photo, loaded with the signed-in Admin's own token. Photos are private: the server streams
 * them only to the chef who took them and to Admins, so there is no public URL to leak. A failed load (expired
 * token, file gone) offers a retry that refreshes the session first.
 */
export function EvidencePhoto({ label, path }: { label: string; path: string | null | undefined }) {
  const token = useAuthStore((s) => s.session?.token);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (!path) {
    return (
      <View style={[styles.box, styles.empty]}>
        <Txt variant="caption" center>{label}: not provided</Txt>
      </View>
    );
  }
  const retry = async () => {
    await refreshSession().catch(() => null);
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Txt variant="caption">{label}</Txt>
      {failed ? (
        <Pressable style={[styles.box, styles.empty]} onPress={retry} accessibilityRole="button" accessibilityLabel={`Retry loading ${label}`}>
          <Txt variant="caption" center>Couldn’t load. Tap to retry.</Txt>
        </Pressable>
      ) : (
        <Image
          key={attempt}
          source={{ uri: `${ORIGIN}${path}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
          style={styles.box}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityLabel={label}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.border },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 8 },
});
