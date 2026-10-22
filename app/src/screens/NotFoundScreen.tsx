// NF-1 (RR-7): any link the app doesn't know. Plain words and one way back.
import React from 'react';
import { useNav } from '../state/nav';
import { Button, Card, Screen, Txt } from '../ui/kit';

export function NotFoundScreen() {
  const nav = useNav();
  return (
    <Screen>
      <Card>
        <Txt variant="title" role="header">We couldn't find that page.</Txt>
        <Txt>The link may be old or mistyped. Your photos are safe.</Txt>
        <Button label="Go to Photos" onPress={() => nav.goPhotos()} />
      </Card>
    </Screen>
  );
}
