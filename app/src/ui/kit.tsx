// Grandparent-first building blocks. Every tappable thing is a <Button>/<Choice>: it always has
// an accessibilityLabel, a visible word, and a 48 pt minimum target.
import React, { type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MIN_TARGET, fonts, useTheme } from './theme';

type TxtVariant = 'body' | 'strong' | 'muted' | 'title' | 'display';

export function Txt({ variant = 'body', style, children, role, testID, numberOfLines, selectable }: {
  selectable?: boolean;
  variant?: TxtVariant; style?: StyleProp<TextStyle>; children: ReactNode; role?: 'header' | 'alert' | 'text'; testID?: string; numberOfLines?: number;
}) {
  const { c, t } = useTheme();
  const v: Record<TxtVariant, TextStyle> = {
    body: { fontFamily: fonts.body, fontSize: t.base, lineHeight: t.line, color: c.ink },
    strong: { fontFamily: fonts.bodyBold, fontSize: t.base, lineHeight: t.line, color: c.ink, fontWeight: '700' },
    muted: { fontFamily: fonts.body, fontSize: t.base, lineHeight: t.line, color: c.muted },
    title: { fontFamily: fonts.display, fontSize: t.title, lineHeight: Math.round(t.title * 1.25), color: c.ink },
    display: { fontFamily: fonts.display, fontSize: t.display, lineHeight: Math.round(t.display * 1.2), color: c.ink },
  };
  return (
    <Text selectable={selectable} accessibilityRole={role === 'text' ? undefined : role} testID={testID} numberOfLines={numberOfLines} style={[v[variant], style]}>
      {children}
    </Text>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

export function Button({ label, text, onPress, variant = 'primary', disabled, softDisabled, style, selected, testID, busy, role = 'button' }: {
  /** What a screen reader says. Required: no unlabeled targets. */
  label: string;
  /** Visible words; defaults to the label. */
  text?: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Looks and reads as off, but a tap still reaches onPress so the screen can say why ("Pick one above first."). */
  softDisabled?: boolean;
  selected?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  role?: 'button' | 'link';
}) {
  const { c, t } = useTheme();
  const bg = { primary: c.accent, secondary: c.surface, danger: c.danger, quiet: 'transparent' }[variant];
  const fg = { primary: c.accentInk, secondary: c.ink, danger: c.onDanger, quiet: c.ink }[variant];
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!softDisabled, selected: !!selected, busy: !!busy }}
      // undefined, not false: Pressable copies a boolean `disabled` over accessibilityState and would undo softDisabled
      disabled={disabled || busy || undefined}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: variant === 'secondary' || variant === 'quiet' ? c.line : bg, opacity: disabled || softDisabled ? 0.5 : pressed ? 0.85 : 1 },
        selected ? { borderColor: c.accent, borderWidth: 2, backgroundColor: c.accentSoft } : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : null}
      {typeof (text ?? label) === 'string' ? (
        <Text style={{ color: fg, fontFamily: fonts.bodySemi, fontWeight: '600', fontSize: t.base, textAlign: 'center' }}>{text ?? label}</Text>
      ) : (
        text
      )}
    </Pressable>
  );
}

/** A whole-card checkbox / radio / switch: the full row is the 48 pt+ target. */
export function Choice({ label, title, detail, checked, onPress, kind }: {
  label: string; title: string; detail?: string; checked: boolean; onPress: () => void; kind: 'checkbox' | 'radio' | 'switch';
}) {
  const { c, t } = useTheme();
  const mark = kind === 'switch' ? (checked ? 'On' : 'Off') : checked ? '✓' : '';
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: checked ? c.accent : c.line, backgroundColor: checked ? c.accentSoft : c.surface, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.mark, { borderColor: checked ? c.accent : c.muted, backgroundColor: checked ? c.accent : 'transparent', minWidth: kind === 'switch' ? 56 : 32 }]}>
        <Text style={{ color: checked ? c.accentInk : c.ink, fontSize: t.base, fontFamily: fonts.bodyBold, fontWeight: '700' }}>{mark}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="strong">{title}</Txt>
        {detail ? <Txt variant="muted">{detail}</Txt> : null}
      </View>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { c, t } = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="strong">{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...rest}
        style={[
          { minHeight: 56, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, color: c.ink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: t.base, fontFamily: fonts.body },
          style,
        ]}
      />
    </View>
  );
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { c } = useTheme();
  return <View testID={testID} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}

export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Spinner WITH words: June needs to know something is happening (UX-REVIEW #10). */
export function Loading({ words }: { words: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={c.accent} />
      <Txt variant="muted">{words}</Txt>
    </View>
  );
}

export function Notice({ text, onClose, tone = 'info' }: { text: string; onClose?: () => void; tone?: 'info' | 'good' }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: tone === 'good' ? c.safeSoft : c.accentSoft, borderColor: c.line }]}>
      <Txt style={{ flex: 1, color: tone === 'good' ? c.safe : c.ink }}>{text}</Txt>
      {onClose ? <Button label="OK, hide this message" text="OK" variant="secondary" onPress={onClose} /> : null}
    </View>
  );
}

/** In-app confirm (not Alert.alert): big text, two labeled buttons, works on web and in tests. */
export function Confirm({ visible, title, body, yes, no, onYes, onNo }: {
  visible: boolean; title: string; body?: string; yes: string; no: string; onYes: () => void; onNo: () => void;
}) {
  const { c } = useTheme();
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onNo}>
      <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.surface }]}>
          <Txt variant="title" role="header">{title}</Txt>
          {body ? <Txt>{body}</Txt> : null}
          <Button label={yes} variant="danger" onPress={onYes} />
          <Button label={no} variant="secondary" onPress={onNo} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, borderRadius: 999, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  choice: { minHeight: MIN_TARGET + 8, minWidth: MIN_TARGET, borderWidth: 2, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { minHeight: 32, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  screen: { padding: 16, gap: 16, paddingBottom: 32 },
  loading: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  scrim: { flex: 1, justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 18, padding: 20, gap: 14 },
});
