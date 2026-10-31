// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// The phone's own tab bar on iPhone and Android (DESIGN-SYSTEM.md), Hearth's bar on the web.
import { Redirect, Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { Platform } from 'react-native';
import { AppGate } from '../../screens/AppGate';
import { HearthTabBar, NATIVE_TAB_OPTIONS, TAB_ICONS, tabsFor, type TabName } from '../../screens/TabBar';
import { useApp } from '../../state/AppContext';
import { useTheme } from '../../ui/theme';

const ALL: TabName[] = ['photos', 'share', 'groups', 'help', 'me'];

export default function TabsLayout() {
  const app = useApp();
  const { c } = useTheme();
  if (app.status === 'signedOut') return <Redirect href="/sign-in" />;
  if (app.status !== 'ready' || !app.space) return <AppGate />;
  const role = app.space.role;
  const tabs = tabsFor(role);
  const allowed = new Set(tabs.map((t) => t.name));

  if (Platform.OS !== 'web') {
    return (
      <NativeTabs
        minimizeBehavior={NATIVE_TAB_OPTIONS.minimizeBehavior}
        labelVisibilityMode={NATIVE_TAB_OPTIONS.labelVisibilityMode}
        labelStyle={{ default: { ...NATIVE_TAB_OPTIONS.labelStyle, color: c.muted }, selected: { ...NATIVE_TAB_OPTIONS.labelStyle, color: c.accent } }}
        tintColor={c.accent}
        backgroundColor={c.surface}
      >
        {ALL.map((name) => {
          const tab = tabs.find((t) => t.name === name);
          return (
            <NativeTabs.Trigger key={name} name={name} hidden={!allowed.has(name)}>
              <NativeTabs.Trigger.Icon sf={TAB_ICONS[name].sf as never} md={TAB_ICONS[name].md as never} />
              <NativeTabs.Trigger.Label>{tab?.label ?? name}</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
          );
        })}
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <HearthTabBar
          role={role}
          current={props.state.routes[props.state.index]!.name as TabName}
          onNavigate={(t) => {
            // SDK 58: the tab bar gets navigateToTab(routeKey) instead of navigation.
            const key = props.state.routes.find((r) => r.name === t)?.key;
            if (key) props.navigateToTab(key);
          }}
        />
      )}
    >
      {ALL.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: allowed.has(name) ? undefined : null }} />
      ))}
    </Tabs>
  );
}
