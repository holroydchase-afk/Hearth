// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Tabs: the phone's own tab bar on iPhone and Android (see app/(tabs)/_layout.tsx), this bar on the web.
// Every tab has a system symbol and a word (HIG Tab bars; DS-3), 17 pt labels (DS-2), labels that never
// hide (DS-5) and 48 pt+ targets (DS-1). Viewers: Photos + Help only.
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Role } from '../api/HearthApi';
import { MIN_TARGET, fontFamily, typeScale, useTheme } from '../ui/theme';

export type TabName = 'photos' | 'share' | 'groups' | 'help' | 'me';
export interface TabDef { name: TabName; label: string }

/** SF Symbols on iPhone, Material Symbols on Android and the web. */
export const TAB_ICONS: Record<TabName, { sf: string; md: string }> = {
  photos: { sf: 'photo.on.rectangle', md: 'photo_library' },
  share: { sf: 'plus.circle', md: 'add_circle' },
  groups: { sf: 'person.3', md: 'groups' },
  help: { sf: 'questionmark.circle', md: 'help' },
  me: { sf: 'person.crop.circle', md: 'account_circle' },
};

/** Options for the native tab bar (expo-router NativeTabs). */
export const NATIVE_TAB_OPTIONS = {
  minimizeBehavior: 'never', // DS-5: iOS 26 can shrink the bar on scroll; the way back stays visible
  labelVisibilityMode: 'labeled', // DS-5: Android shows every label, not only the selected one
  labelStyle: { fontSize: 17 }, // DS-2: platform tab labels are 10–12 pt
} as const;

const ALL: Record<TabName, TabDef> = {
  photos: { name: 'photos', label: 'Photos' },
  share: { name: 'share', label: 'Share' },
  groups: { name: 'groups', label: 'Groups' },
  help: { name: 'help', label: 'Help' },
  me: { name: 'me', label: 'Me' },
};

export function tabsFor(role: Role): TabDef[] {
  return role === 'viewer' ? [ALL.photos, ALL.help] : [ALL.photos, ALL.share, ALL.groups, ALL.me];
}

export function HearthTabBar({ role, current, onNavigate }: { role: Role; current: TabName; onNavigate: (t: TabName) => void }) {
  const { c, bigText } = useTheme();
  const t = typeScale(bigText);
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.line, paddingBottom: Math.max(insets.bottom, 6) }]}>
      {tabsFor(role).map((tab) => {
        const on = tab.name === current;
        const color = on ? c.accent : c.muted;
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
            onPress={() => onNavigate(tab.name)}
            style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <SymbolView
                name={{ ios: TAB_ICONS[tab.name].sf as never, android: TAB_ICONS[tab.name].md as never, web: TAB_ICONS[tab.name].md as never }}
                size={28}
                tintColor={color}
              />
            </View>
            <Text style={{ fontSize: t.base, fontFamily, fontWeight: on ? '600' : '500', color }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, paddingHorizontal: 8, gap: 6 },
  tab: { flex: 1, minHeight: MIN_TARGET + 12, minWidth: MIN_TARGET, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 2 },
});
