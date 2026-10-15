// Bottom tabs with words under the icons, 17 pt+, 48 pt+. Viewers: Photos + Help only.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Role } from '../api/HearthApi';
import { MIN_TARGET, fonts, typeScale, useTheme } from '../ui/theme';

export type TabName = 'photos' | 'share' | 'groups' | 'help' | 'me';
export interface TabDef { name: TabName; label: string; icon: string }

const ALL: Record<TabName, TabDef> = {
  photos: { name: 'photos', label: 'Photos', icon: '🖼️' },
  share: { name: 'share', label: 'Share', icon: '➕' },
  groups: { name: 'groups', label: 'Groups', icon: '👪' },
  help: { name: 'help', label: 'Help', icon: '❓' },
  me: { name: 'me', label: 'Me', icon: '🙂' },
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
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
            onPress={() => onNavigate(tab.name)}
            style={({ pressed }) => [styles.tab, { backgroundColor: on ? c.accentSoft : 'transparent', opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={{ fontSize: t.base + 2 }} accessibilityElementsHidden importantForAccessibility="no">{tab.icon}</Text>
            <Text style={{ fontSize: t.base, fontFamily: on ? fonts.bodyBold : fonts.bodySemi, fontWeight: on ? '700' : '600', color: c.ink }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingHorizontal: 8, gap: 6 },
  tab: { flex: 1, minHeight: MIN_TARGET + 12, minWidth: MIN_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 4 },
});
