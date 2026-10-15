import React, { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Txt } from './kit';

/** Last line of defense: a plain sentence and a button, never a stack trace. */
export class ErrorBoundary extends Component<{ children: ReactNode; helper?: string | null }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(e: unknown) {
    // Never log captions, keys or URLs: only the error type.
    console.warn('Hearth screen error', e instanceof Error ? e.name : typeof e);
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Txt variant="title" role="header">Something went wrong.</Txt>
        <Txt>{`Close Hearth and open it again. If it keeps happening, call ${this.props.helper ?? 'the person who set it up for you'}.`}</Txt>
        <Button label="Try again" onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}
