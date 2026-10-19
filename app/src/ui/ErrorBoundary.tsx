import React, { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ClientErrorReport } from '../api/types';
import { recordProblem } from '../errors/problemLog';
import { errorReport } from '../errors/report';
import { Button, Txt } from './kit';

/** Last line of defense: a plain sentence and a button, never a stack trace. */
interface Props {
  children: ReactNode;
  helper?: string | null;
  /** BETA-OPS-1: sends our own error report (no third-party SDK). */
  onReport?: (r: ClientErrorReport) => Promise<void>;
  screen?: string;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(e: unknown) {
    // Never log captions, keys or URLs: only the error type.
    console.warn('Hearth screen error', e instanceof Error ? e.name : typeof e);
    recordProblem(e, this.props.screen ?? 'app'); // DBG-1: debug builds only, redacted
    try {
      this.props.onReport?.(errorReport(e, this.props.screen ?? 'app')).catch(() => {});
    } catch { /* a report must never cause a second error */ }
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
