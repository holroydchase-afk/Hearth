// Messenger (docs/product/SPEC-MESSENGER.md): opened in place from a "Messages" button at the top of Photos, like
// Events. The list of chats, then one chat. End to end encrypted (MLS); the words never reach Hearth's servers.
// A2: no read receipts, typing dots, "seen" or last-active anywhere. Relatives see a group chat titled by its
// people, never the group's name (AUD-14; the server sends the title).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChatSummary } from '../api/types';
import { messageFor } from '../errors/messages';
import { ChatClient, type ChatLine, type ChatView } from '../messenger/client';
import { useApp } from '../state/AppContext';
import { Button, Card, Field, Loading, Notice, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';

const POLL_MS = 10_000;
// RR-18: parents are in every chat (REPLY-10), so a chat's count can be higher than its group's; say why.
const PRIVACY = 'Only the people in this chat can read it. Parents are in every chat. Hearth can’t: messages are locked on your phone before they are sent.';

export function MessagesScreen({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const userId = app.session?.userId ?? null;
  const client = useMemo(() => (userId ? new ChatClient(app.deps.api, userId) : null), [app.deps.api, userId]);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [open, setOpen] = useState<ChatSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app.space) return;
    let live = true;
    app.deps.api.chatList(app.space.space_id).then((c) => live && setChats(c), (e) => live && setError(messageFor(e)));
    return () => { live = false; };
  }, [app.deps.api, app.space]);

  if (open && client) return <ChatScreen chat={open} client={client} onClose={() => setOpen(null)} />;
  return (
    <Shell>
      <Txt variant="display" role="header">Messages</Txt>
      <Button label="Back to Photos" icon={{ sf: 'chevron.backward', md: 'arrow_back' }} variant="secondary" onPress={onClose} />
      <Txt variant="muted">{PRIVACY}</Txt>
      {error ? <Notice text={error} /> : null}
      {!chats && !error ? <Loading words="Getting your chats…" /> : null}
      {chats?.length === 0 ? <Txt>No chats yet.</Txt> : null}
      {chats?.map((c) => (
        <Card key={c.circle_id}>
          <Txt variant="title">{c.title}</Txt>
          <Txt variant="muted">{c.kind === 'event' ? `Event · ${c.member_count} people` : `${c.member_count} people`}</Txt>
          <Button label={chatOpenLabel(c)} text="Open" variant="secondary" onPress={() => setOpen(c)} />
        </Card>
      ))}
    </Shell>
  );
}

/** "Open the chat with Alex and Grandpa Earl" for people; "Open the chat Charleston trip" for a named group or event. */
export function chatOpenLabel(c: ChatSummary): string {
  return c.named ? `Open the chat ${c.title}` : `Open the chat with ${c.title}`;
}

function ChatScreen({ chat, client, onClose }: { chat: ChatSummary; client: ChatClient; onClose: () => void }) {
  const [view, setView] = useState<ChatView | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const v = await client.open(chat.circle_id);
      if (live.current) { setView(v); setError(null); }
    } catch (e) {
      if (live.current) setError(messageFor(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }, [client, chat.circle_id]);

  useEffect(() => {
    live.current = true;
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => { live.current = false; clearInterval(t); };
  }, [refresh]);

  const send = async () => {
    const text = draft.trim();
    if (!text) { setError('Write something first, then tap Send.'); return; }
    setBusy(true);
    try {
      const line = await client.send(chat.circle_id, text);
      if (live.current) {
        setDraft('');
        setView((v) => (v ? { ...v, lines: [...v.lines, line] } : v));
        setError(null);
      }
    } catch (e) {
      if (live.current) setError(messageFor(e));
    } finally {
      if (live.current) setBusy(false);
    }
  };

  return (
    <Shell>
      <Txt variant="display" role="header">{chat.title}</Txt>
      <Button label="Back to all messages" icon={{ sf: 'chevron.backward', md: 'arrow_back' }} variant="secondary" onPress={onClose} />
      <Txt variant="muted">{PRIVACY}</Txt>
      {error ? <Notice text={error} /> : null}
      {!view ? <Loading words="Opening the chat…" /> : null}
      {view?.status === 'waiting' ? (
        <Card>
          <Txt>You can write here once someone else in this chat opens Messages. Their phone lets yours in.</Txt>
        </Card>
      ) : null}
      {view?.status === 'ready' && view.lines.length === 0 ? <Txt variant="muted">No messages yet. Say hello!</Txt> : null}
      {view?.lines.map((l) => <Line key={`${l.id}-${l.mine ? 'me' : 'them'}`} line={l} />)}
      <Button label="Check for new messages" variant="secondary" busy={busy} onPress={() => void refresh()} />
      {view?.status === 'ready' ? (
        <View style={{ gap: 12 }}>
          <Field label="Your message" value={draft} onChangeText={setDraft} multiline maxLength={4000} />
          <Button label="Send" onPress={() => void send()} busy={busy} />
        </View>
      ) : null}
    </Shell>
  );
}

function Line({ line }: { line: ChatLine }) {
  const { c } = useTheme();
  return (
    <View style={{ alignSelf: line.mine ? 'flex-end' : 'flex-start', maxWidth: '90%', gap: 4, padding: 12, borderRadius: 16,
      backgroundColor: line.mine ? c.accentSoft : c.surface, borderWidth: 1, borderColor: c.line }}>
      <Txt variant="strong">{line.mine ? 'You' : line.name}</Txt>
      <Txt selectable>{line.text}</Txt>
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const items = React.Children.toArray(children);
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <View>{item}</View>}
        contentContainerStyle={{ padding: 20, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}
