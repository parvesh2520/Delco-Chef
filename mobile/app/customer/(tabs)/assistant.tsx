import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, Txt } from '../../../src/components';
import { FadeInUp, PressableScale, PulseDot } from '../../../src/motion';
import { colors, fonts, radius, shadow, spacing } from '../../../src/theme';

type Icon = keyof typeof Ionicons.glyphMap;
type Message = { id: string; from: 'user' | 'ai'; text: string; time: string };

const TOPICS: { icon: Icon; title: string; prompt: string }[] = [
  { icon: 'calendar-outline', title: 'Weekly menu', prompt: 'Plan a healthy vegetarian menu for this week' },
  { icon: 'nutrition-outline', title: 'Use what I have', prompt: 'What can I cook with paneer, spinach and rice?' },
  { icon: 'people-outline', title: 'Hosting', prompt: 'Suggest a dinner menu for 6 guests on Saturday' },
  { icon: 'receipt-outline', title: 'My plan', prompt: 'Which plan suits a family of four?' },
];

const KNOWS: { icon: Icon; label: string }[] = [
  { icon: 'leaf-outline', label: 'Your diet' },
  { icon: 'alert-circle-outline', label: 'Allergies' },
  { icon: 'time-outline', label: 'Chef visits' },
];

// UI only — no AI backend yet. Replace with the real call when it's ready.
const PLACEHOLDER_REPLY = 'I’m not switched on yet. Soon I’ll plan menus around your diet, suggest dishes for your chef and help with bookings.';

const clock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Mark({ size = 40 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}>
      <Txt style={{ fontFamily: fonts.heading, fontSize: size * 0.46, lineHeight: size * 0.56 }} color={colors.textOnDark}>D</Txt>
      <View style={[styles.markDot, { width: size * 0.14, height: size * 0.14, borderRadius: size, right: size * 0.2, bottom: size * 0.24 }]} />
    </View>
  );
}

function Typing() {
  return (
    <View style={[styles.bubble, styles.ai, styles.typing]}>
      <PulseDot color={colors.textMuted} size={6} />
      <PulseDot color={colors.textMuted} size={6} />
      <PulseDot color={colors.textMuted} size={6} />
    </View>
  );
}

/** Chat screen for the upcoming Delco AI assistant. */
export default function CustomerAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || thinking) return;
    setMessages((m) => [...m, { id: `u${Date.now()}`, from: 'user', text: t, time: clock() }]);
    setDraft('');
    setThinking(true);
    timer.current = setTimeout(() => {
      setMessages((m) => [...m, { id: `a${Date.now()}`, from: 'ai', text: PLACEHOLDER_REPLY, time: clock() }]);
      setThinking(false);
    }, 1100);
  };

  const canSend = !!draft.trim() && !thinking;

  return (
    <Screen
      back={false}
      title="Delco AI"
      scroll={false}
      right={messages.length > 0 ? (
        <PressableScale onPress={() => setMessages([])} accessibilityRole="button" accessibilityLabel="New chat" style={styles.iconBtn}>
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </PressableScale>
      ) : undefined}
      footer={
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about menus, recipes or bookings"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            accessibilityLabel="Message Delco AI"
          />
          {/* Mic is visual only for now — no voice input yet. */}
          <PressableScale onPress={() => {}} accessibilityRole="button" accessibilityLabel="Voice input, coming soon" style={[styles.roundBtn, styles.micBtn]}>
            <Ionicons name="mic-outline" size={20} color={colors.primary} />
          </PressableScale>
          <PressableScale
            onPress={() => send(draft)}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={[styles.roundBtn, { backgroundColor: colors.primary, opacity: canSend ? 1 : 0.35 }]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.textOnDark} />
          </PressableScale>
        </View>
      }
    >
      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => messages.length && scroller.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <>
            <FadeInUp index={1}>
              <Card tone="plum" style={styles.hero}>
                <View style={styles.heroTop}>
                  <Mark size={36} />
                  <View style={styles.soon}>
                    <Txt variant="caption" color={colors.primary} style={{ fontFamily: fonts.medium }}>Coming soon</Txt>
                  </View>
                </View>
                <Txt variant="h3" color={colors.textOnDark} style={{ fontSize: 19, lineHeight: 25 }}>Your kitchen, one question away</Txt>
                <Txt variant="small" color={colors.accentLight}>Menus, recipes and booking help, planned around your family’s tastes.</Txt>
                <View style={styles.knows}>
                  {KNOWS.map((k) => (
                    <View key={k.label} style={styles.know}>
                      <Ionicons name={k.icon} size={14} color={colors.accent} />
                      <Txt variant="caption" color={colors.textOnDark}>{k.label}</Txt>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeInUp>

            <FadeInUp index={2} style={{ gap: 8 }}>
              <Txt variant="h3" style={{ paddingHorizontal: 4 }}>Try asking</Txt>
              <View style={styles.grid}>
                {TOPICS.map((t) => (
                  <PressableScale key={t.title} onPress={() => send(t.prompt)} accessibilityRole="button" accessibilityLabel={t.prompt} style={styles.topic}>
                    <View style={styles.topicIcon}>
                      <Ionicons name={t.icon} size={16} color={colors.purple} />
                    </View>
                    <Txt variant="bodyStrong">{t.title}</Txt>
                    <Txt variant="small" numberOfLines={2}>{t.prompt}</Txt>
                  </PressableScale>
                ))}
              </View>
            </FadeInUp>
          </>
        ) : (
          <View style={{ gap: 12 }}>
            {messages.map((m) =>
              m.from === 'user' ? (
                <FadeInUp key={m.id} distance={6} style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.bubble, styles.user]}>
                    <Txt color={colors.textOnDark}>{m.text}</Txt>
                  </View>
                  <Txt variant="caption" color={colors.textMuted}>{m.time}</Txt>
                </FadeInUp>
              ) : (
                <FadeInUp key={m.id} distance={6} style={styles.aiRow}>
                  <Mark size={28} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={[styles.bubble, styles.ai]}>
                      <Txt>{m.text}</Txt>
                    </View>
                    <Txt variant="caption" color={colors.textMuted}>Delco AI · {m.time}</Txt>
                  </View>
                </FadeInUp>
              ),
            )}
            {thinking && (
              <View style={styles.aiRow}>
                <Mark size={28} />
                <Typing />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mark: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,248,239,0.18)' },
  markDot: { position: 'absolute', backgroundColor: colors.accent },
  hero: { padding: spacing.md, gap: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  soon: { backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  knows: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  know: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,248,239,0.1)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  topic: { flexBasis: '46%', flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, gap: 4, ...shadow },
  topicIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '85%', paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.lg },
  user: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 6, ...shadow },
  typing: { flexDirection: 'row', gap: 6, paddingVertical: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 24,
    paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, fontFamily: fonts.body, fontSize: 15, color: colors.text,
  },
  roundBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  micBtn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
