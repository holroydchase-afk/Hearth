// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Grandparent-first building blocks in each phone's own style (DESIGN-SYSTEM.md): Apple's on iPhone and the
// web, Material 3 on Android. Every tappable thing is a <Button>/<Choice>: it always has an
// accessibilityLabel, a visible word (DS-3), and a 48 pt minimum target (DS-1).
import { SymbolView } from 'expo-symbols';
import React, { type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MIN_TARGET, fontFamily, useTheme } from './theme';

/** A system symbol: SF Symbol name on iPhone, Material Symbol name on Android and the web. */
export interface Icon { sf: string; md: string }

export function SystemIcon({ icon, color, size = 22 }: { icon: Icon; color: string; size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SymbolView name={{ ios: icon.sf as never, android: icon.md as never, web: icon.md as never }} size={size} tintColor={color} />
    </View>
  );
}

type TxtVariant = 'body' | 'strong' | 'muted' | 'title' | 'display';

export function Txt({ variant = 'body', style, children, role, testID, numberOfLines, selectable }: {
  selectable?: boolean;
  variant?: TxtVariant; style?: StyleProp<TextStyle>; children: ReactNode; role?: 'header' | 'alert' | 'text'; testID?: string; numberOfLines?: number;
}) {
  const { c, t } = useTheme();
  // HIG text styles: Body, Headline (semibold), Title 2, Title 1 (bold); Material: body/title/headline.
  const v: Record<TxtVariant, TextStyle> = {
    body: { fontFamily, fontSize: t.base, lineHeight: t.line, color: c.ink },
    strong: { fontFamily, fontSize: t.base, lineHeight: t.line, color: c.ink, fontWeight: '600' },
    muted: { fontFamily, fontSize: t.base, lineHeight: t.line, color: c.muted },
    title: { fontFamily, fontSize: t.title, lineHeight: Math.round(t.title * 1.25), color: c.ink, fontWeight: '700' },
    display: { fontFamily, fontSize: t.display, lineHeight: Math.round(t.display * 1.2), color: c.ink, fontWeight: '700' },
  };
  return (
    <Text selectable={selectable} accessibilityRole={role === 'text' ? undefined : role} testID={testID} numberOfLines={numberOfLines} style={[v[variant], style]}>
      {children}
    </Text>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

export function Button({ label, text, onPress, variant = 'primary', disabled, softDisabled, style, selected, testID, busy, role = 'button', icon }: {
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
  /** A system symbol shown before the words, never instead of them (DS-3). */
  icon?: Icon;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  role?: 'button' | 'link';
}) {
  const { c, t, os } = useTheme();
  const material = os === 'android';
  // iPhone: filled, gray (tinted fill) and plain buttons. Android: filled, outlined and text buttons.
  const bg = { primary: c.accent, secondary: material ? 'transparent' : c.fill, danger: c.danger, quiet: 'transparent' }[variant];
  const fg = { primary: c.accentInk, secondary: c.accent, danger: c.onDanger, quiet: c.accent }[variant];
  const border = variant === 'secondary' && material ? c.muted : bg;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!softDisabled, selected: !!selected, busy: !!busy }}
      // undefined, not false: Pressable copies a boolean `disabled` over accessibilityState and would undo softDisabled
      disabled={disabled || busy || undefined}
      onPress={onPress}
      testID={testID}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, opacity: disabled || softDisabled ? 0.5 : pressed && !material ? 0.7 : 1 },
        selected ? { borderColor: c.accent, borderWidth: 2, backgroundColor: c.accentSoft } : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : null}
      {icon && !busy ? <SystemIcon icon={icon} color={selected ? c.accent : fg} /> : null}
      {typeof (text ?? label) === 'string' ? (
        <Text style={{ color: selected ? c.ink : fg, fontFamily, fontWeight: material ? '500' : '600', fontSize: t.base, textAlign: 'center' }}>{text ?? label}</Text>
      ) : (
        text
      )}
    </Pressable>
  );
}

/** A whole-card checkbox / radio / switch: the full row is the 48 pt+ target. Switches are the phone's own
 *  switch with the word On or Off beside it (DS-3); checkboxes and radios take each platform's shape. */
export function Choice({ label, title, detail, checked, onPress, kind }: {
  label: string; title: string; detail?: string; checked: boolean; onPress: () => void; kind: 'checkbox' | 'radio' | 'switch';
}) {
  const { c, t, os } = useTheme();
  const round = kind === 'radio' || (kind === 'checkbox' && os !== 'android');
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: checked ? c.accent : c.line, backgroundColor: checked ? c.accentSoft : c.surface, opacity: pressed && os !== 'android' ? 0.7 : 1 },
      ]}
    >
      {kind === 'switch' ? null : (
        <View style={[styles.mark, { borderRadius: round ? 999 : 4, borderColor: checked ? c.accent : c.muted, backgroundColor: checked && kind === 'checkbox' ? c.accent : 'transparent' }]}>
          {checked && kind === 'radio' ? <View style={[styles.dot, { backgroundColor: c.accent }]} /> : null}
          {checked && kind === 'checkbox' ? <Text style={{ color: c.accentInk, fontSize: t.base, fontFamily, fontWeight: '700' }}>✓</Text> : null}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="strong">{title}</Txt>
        {detail ? <Txt variant="muted">{detail}</Txt> : null}
      </View>
      {kind === 'switch' ? (
        <View style={styles.switchBox} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={{ color: c.ink, fontSize: t.base, fontFamily, fontWeight: '600' }}>{checked ? 'On' : 'Off'}</Text>
          <Switch value={checked} trackColor={{ true: c.accent, false: c.line }} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { c, t, os } = useTheme();
  const { label, style, ...rest } = props;
  // iPhone: a rounded field like a grouped-list cell, with an edge so it shows on any background.
  // Android: Material's outlined text field.
  const box: TextStyle = os === 'android'
    ? { borderWidth: 1, borderColor: c.muted, backgroundColor: 'transparent', borderRadius: 4 }
    : { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 10 };
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="strong">{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...rest}
        style={[
          { minHeight: 56, color: c.ink, paddingHorizontal: 14, paddingVertical: 12, fontSize: t.base, fontFamily, ...box },
          style,
        ]}
      />
    </View>
  );
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { c, os } = useTheme();
  // iPhone: an inset grouped section. Android: Material's outlined card.
  const look = os === 'android' ? { borderWidth: 1, borderColor: c.line, borderRadius: 12 } : { borderWidth: 0, borderRadius: 10 };
  return <View testID={testID} style={[styles.card, { backgroundColor: c.surface }, look, style]}>{children}</View>;
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

/** In-app confirm in the shape of the phone's own alert (iPhone) or dialog (Material), not Alert.alert:
 *  the system ones use 13–14 pt buttons on Android (DS-2), don't work on the web, and can't be tested. */
export function Confirm({ visible, title, body, yes, no, onYes, onNo }: {
  visible: boolean; title: string; body?: string; yes: string; no: string; onYes: () => void; onNo: () => void;
}) {
  const { c, os } = useTheme();
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onNo}>
      <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.surface, borderRadius: os === 'android' ? 28 : 14 }]}>
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
  choice: { minHeight: MIN_TARGET + 8, minWidth: MIN_TARGET, borderWidth: 2, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 28, height: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 999 },
  switchBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { padding: 14, gap: 12 },
  screen: { padding: 16, gap: 16, paddingBottom: 32 },
  loading: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  scrim: { flex: 1, justifyContent: 'center', padding: 16 },
  sheet: { padding: 20, gap: 14 },
});
