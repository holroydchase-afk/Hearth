import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { AppGate } from '../../screens/AppGate';
import { HearthTabBar, tabsFor, type TabName } from '../../screens/TabBar';
import { useApp } from '../../state/AppContext';

const ALL: TabName[] = ['photos', 'share', 'groups', 'help', 'me'];

export default function TabsLayout() {
  const app = useApp();
  if (app.status === 'signedOut') return <Redirect href="/sign-in" />;
  if (app.status !== 'ready' || !app.space) return <AppGate />;
  const role = app.space.role;
  const allowed = new Set(tabsFor(role).map((t) => t.name));
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <HearthTabBar
          role={role}
          current={props.state.routes[props.state.index]!.name as TabName}
          onNavigate={(t) => props.navigation.navigate(t)}
        />
      )}
    >
      {ALL.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: allowed.has(name) ? undefined : null }} />
      ))}
    </Tabs>
  );
}
