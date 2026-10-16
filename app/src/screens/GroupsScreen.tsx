// Groups (posters only): see groups and who is in them; basic rename; invite someone.
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import type { Circle } from '../api/HearthApi';
import { messageFor } from '../errors/messages';
import { useApp } from '../state/AppContext';
import { Button, Card, Field, Loading, Notice, Screen, Txt } from '../ui/kit';
import { people } from '../ui/format';
import { useTheme } from '../ui/theme';
import { AppGate } from './AppGate';

export function GroupsScreen() {
  const app = useApp();
  const { c } = useTheme();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [invite, setInvite] = useState<{ circle: string; link: string; code: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null); // circle id whose invite form is open
  const [inviteName, setInviteName] = useState('');
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => { app.deps.api.myProfile().then((p) => setMyName(p.display_name)).catch(() => {}); }, [app.deps.api]);
  const spaceId = app.space?.space_id;
  const canPost = !!app.space?.can_post;

  const load = useCallback(async () => {
    if (!spaceId) return;
    try {
      setCircles(await app.deps.api.myCircles(spaceId));
    } catch (e) {
      setCircles([]);
      setNotice(messageFor(e));
    }
  }, [app.deps.api, spaceId]);

  useEffect(() => { if (canPost) void load(); }, [load, canPost]);

  if (app.status !== 'ready' || !app.space) return <AppGate />;
  if (!canPost) return <Screen><Txt variant="title">You can't do that here.</Txt></Screen>;

  const saveName = async (id: string) => {
    try {
      await app.deps.api.renameCircle(id, name);
      setRenaming(null);
      await load();
    } catch (e) {
      setNotice(messageFor(e, { action: 'group' }));
    }
  };

  const makeInvite = async (id: string) => {
    try {
      // JOIN-1: the name the family uses becomes theirs when they join, so they type nothing.
      const r = await app.deps.api.createInvite({ space: app.space!.space_id, role: 'viewer', circleIds: [id], ttlDays: 30, name: inviteName.trim() || null });
      setInvite({ circle: id, link: r.link, code: r.code });
      setAsking(null);
      setInviteName('');
    } catch (e) {
      setNotice(messageFor(e, { action: 'invite' }));
    }
  };

  const text = (link: string, code: string) => {
    // grandparent-ux: name the sender (an unsaved number or an email reads like a scam), and offer a call, not an app store trip.
    const hi = myName ? `Hi, it's ${myName}.` : 'Hi, this is your family.';
    const body = `${hi} I set up a private place for the kids' photos. Tap this to see them, no password: ${link}\n\nIf that doesn't open, call me and I'll help. Your code is ${code.slice(0, 5)} ${code.slice(5)}.`;
    const sep = Platform.OS === 'ios' ? '&' : '?';
    void app.deps.openUrl(`sms:${sep}body=${encodeURIComponent(body)}`);
  };

  return (
    <Screen>
      <Txt variant="display" role="header">Your groups</Txt>
      <Txt variant="muted">Each photo goes only to the groups you pick. People never see group names.</Txt>
      {notice ? <Notice text={notice} onClose={() => setNotice(null)} /> : null}
      {circles === null ? <Loading words="Loading your groups…" /> : null}
      {(circles ?? []).map((g) => (
        <Card key={g.circle_id}>
          <Txt variant="title">{g.name}</Txt>
          <Txt variant="muted">{people(g.member_count)}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {g.member_names.map((m, i) => (
              <View key={`${m}-${i}`} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.safeSoft }}>
                <Txt>{`✓ ${m}`}</Txt>
              </View>
            ))}
          </View>
          {renaming === g.circle_id ? (
            <>
              <Field label="New name for this group" value={name} onChangeText={setName} autoFocus maxLength={60} />
              <Button label="Save name" onPress={() => void saveName(g.circle_id)} disabled={!name.trim()} />
              <Button label="Cancel" variant="secondary" onPress={() => setRenaming(null)} />
            </>
          ) : (
            <Button label={`Rename ${g.name}`} text="Rename" variant="secondary" onPress={() => { setRenaming(g.circle_id); setName(g.name); }} />
          )}
          {invite?.circle === g.circle_id ? (
            <Card>
              <Txt variant="strong">Invite ready</Txt>
              <Txt selectable>{invite.link}</Txt>
              {/* BETA-JOIN-8: for reading out loud, or when the link opens in a browser */}
              <Txt selectable>{`Or they can type this code in Hearth: ${invite.code.slice(0, 5)} ${invite.code.slice(5)}`}</Txt>
              <Txt>Works for 30 days.</Txt>
              <Button label="Text the invite" onPress={() => text(invite.link, invite.code)} />
            </Card>
          ) : asking === g.circle_id ? (
            <>
              <Field label="Their name, the way your family says it" value={inviteName} onChangeText={setInviteName} placeholder='Like "Grandma June"' maxLength={40} />
              <Txt variant="muted">They'll see this name on Hearth and won't have to type it.</Txt>
              <Button label="Make the invite" onPress={() => void makeInvite(g.circle_id)} />
              <Button label="Cancel" variant="secondary" onPress={() => { setAsking(null); setInviteName(''); }} />
            </>
          ) : (
            <Button label={`Invite someone to ${g.name}`} text="Invite someone" variant="secondary" onPress={() => setAsking(g.circle_id)} />
          )}
        </Card>
      ))}
    </Screen>
  );
}
