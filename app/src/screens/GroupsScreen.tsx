// Groups (parents only): see groups and who is in them; make a group (GRP-15/16); each group's comment setting
// (GRP-17); basic rename; invite someone to one or more groups (GRP-18). Relatives never see any of this.
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import type { Circle, CommentMode, Person, ShareHistory } from '../api/HearthApi';
import { messageFor } from '../errors/messages';
import { useApp } from '../state/AppContext';
import { Button, Card, Choice, Field, Loading, Notice, Screen, Txt } from '../ui/kit';
import { andList, people } from '../ui/format';
import { useTheme } from '../ui/theme';
import { AppGate } from './AppGate';

/** SPEC-GROUPS v2 section 2, in the app's words (grandparent-ux owns the final wording). */
const MODES: { mode: CommentMode; title: string; detail: string }[] = [
  { mode: 'private', title: 'Private', detail: 'Only the parents and whoever posted the photo read them.' },
  { mode: 'on_group_posts', title: "Shared on this group's photos", detail: "People in this group read each other's comments on photos sent to this group." },
  { mode: 'always', title: 'Always shared', detail: "People in this group read each other's comments on every photo they can both see." },
];

/** GRP-17: who will read each other's comments once a group is Always shared (relatives; parents read everything). */
function alwaysWords(names: string[], group: string): string {
  return names.length >= 2
    ? `${andList(names)} will read each other's comments on every photo they can see.`
    : `People in ${group} will read each other's comments on every photo they can see.`;
}

interface NewGroup {
  name: string;
  event: boolean;
  ticked: string[]; // user ids
  copied: string[]; // names of the groups people were copied from (GRP-16)
  mode: CommentMode;
  history: ShareHistory | null;
  need: 'name' | 'history' | null;
  busy: boolean;
}
const NEW_GROUP: NewGroup = { name: '', event: false, ticked: [], copied: [], mode: 'private', history: null, need: null, busy: false };

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
  // BETA-AUD-19: "Share all past photos" or "Only new photos"; neither is picked until the parent picks one.
  const [history, setHistory] = useState<ShareHistory | null>(null);
  const [needHistory, setNeedHistory] = useState(false);
  // PRIV-G2 / GRP-18: a new invite adds Everyone only if it names Everyone; ticked first, can be unticked.
  const [alsoEveryone, setAlsoEveryone] = useState(true);
  // GRP-18: more groups the invite names, besides the one whose button was tapped.
  const [alsoIn, setAlsoIn] = useState<string[]>([]);
  const [myName, setMyName] = useState<string | null>(null);
  const [family, setFamily] = useState<Person[]>([]);
  const [draft, setDraft] = useState<NewGroup | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // GRP-17: group waiting for "Turn on Always shared"
  useEffect(() => { app.deps.api.myProfile().then((p) => setMyName(p.display_name)).catch(() => {}); }, [app.deps.api]);
  const spaceId = app.space?.space_id;
  // Groups, comment settings and invites are for parents only (a relative allowed to post still never sees them).
  const isParent = app.space?.role === 'owner' || app.space?.role === 'adult';

  const load = useCallback(async () => {
    if (!spaceId) return;
    try {
      setCircles(await app.deps.api.myCircles(spaceId));
    } catch (e) {
      setCircles([]);
      setNotice(messageFor(e));
    }
  }, [app.deps.api, spaceId]);

  useEffect(() => {
    if (!isParent || !spaceId) return;
    void load();
    app.deps.api.familyPeople(spaceId).then(setFamily).catch(() => setFamily([]));
  }, [load, isParent, spaceId, app.deps.api]);

  if (app.status !== 'ready' || !app.space) return <AppGate />;
  if (!isParent) return <Screen><Txt variant="title">You can't do that here.</Txt></Screen>;

  const parentNames = new Set(family.filter((p) => p.role !== 'viewer').map((p) => p.name));
  const relatives = family.filter((p) => p.role === 'viewer').sort((a, b) => a.name.localeCompare(b.name));
  const relativesIn = (g: Circle) => g.member_names.filter((n) => !parentNames.has(n));
  const groups = (circles ?? []).filter((g) => g.kind !== 'everyone');

  // ---- GRP-15/16: New group ----
  const edit = (p: Partial<NewGroup>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const tick = (id: string) => setDraft((d) => (d ? { ...d, ticked: d.ticked.includes(id) ? d.ticked.filter((x) => x !== id) : [...d.ticked, id] } : d));
  const copyFrom = (g: Circle) => setDraft((d) => {
    if (!d) return d;
    const ids = relatives.filter((p) => g.member_names.includes(p.name)).map((p) => p.user_id);
    return { ...d, ticked: [...new Set([...d.ticked, ...ids])], copied: d.copied.includes(g.name) ? d.copied : [...d.copied, g.name] };
  });
  const makeGroup = async () => {
    if (!draft || draft.busy) return;
    const name = draft.name.trim();
    if (!name) { edit({ need: 'name' }); return; }
    if (!draft.history) { edit({ need: 'history' }); return; }
    edit({ busy: true, need: null });
    try {
      const id = await app.deps.api.createLevel(app.space!.space_id, draft.event ? 'event' : 'group', name);
      if (draft.mode !== (draft.event ? 'on_group_posts' : 'private')) await app.deps.api.setCommentMode(id, draft.mode);
      for (const u of draft.ticked) await app.deps.api.placePerson(id, u, draft.history);
      setDraft(null);
    } catch (e) {
      edit({ busy: false });
      setNotice(messageFor(e, { action: 'group' }));
    }
    await load();
  };

  // ---- GRP-17: comment setting of an existing group ----
  const setMode = async (g: Circle, mode: CommentMode) => {
    setConfirming(null);
    setCircles((cur) => (cur ?? []).map((x) => (x.circle_id === g.circle_id ? { ...x, comment_mode: mode } : x)));
    try {
      await app.deps.api.setCommentMode(g.circle_id, mode);
    } catch (e) {
      setNotice(messageFor(e, { action: 'group' }));
      await load();
    }
  };
  const pickMode = (g: Circle, mode: CommentMode) => {
    if (mode === g.comment_mode) return;
    if (mode === 'always') setConfirming(g.circle_id); // nothing changes until they confirm
    else void setMode(g, mode);
  };

  const saveName = async (id: string) => {
    try {
      await app.deps.api.renameCircle(id, name);
      setRenaming(null);
      await load();
    } catch (e) {
      setNotice(messageFor(e, { action: 'group' }));
    }
  };

  const closeForm = () => { setAsking(null); setInviteName(''); setHistory(null); setNeedHistory(false); setAlsoEveryone(true); setAlsoIn([]); };
  const everyone = (circles ?? []).find((g) => g.kind === 'everyone');

  const makeInvite = async (id: string) => {
    if (!history) { setNeedHistory(true); return; }
    try {
      // JOIN-1: the name the family uses becomes theirs when they join, so they type nothing.
      const r = await app.deps.api.createInvite({
        space: app.space!.space_id, role: 'viewer', ttlDays: 30, name: inviteName.trim() || null, history,
        circleIds: [
          id,
          ...groups.filter((o) => o.circle_id !== id && alsoIn.includes(o.circle_id)).map((o) => o.circle_id),
          ...(everyone && alsoEveryone && everyone.circle_id !== id ? [everyone.circle_id] : []),
        ],
      });
      setInvite({ circle: id, link: r.link, code: r.code });
      closeForm();
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

  // UX-G4: the server takes an invite only to a household, or (until 0012) a group with nothing under it.
  const invitable = (g: Circle) =>
    g.kind === 'household' || ((g.kind ?? 'group') === 'group' && !(circles ?? []).some((o) => o.parent_ids?.includes(g.circle_id)));

  return (
    <Screen>
      <Txt variant="display" role="header">Your groups</Txt>
      <Txt variant="muted">Each photo goes only to the groups you pick. People never see group names.</Txt>
      {notice ? <Notice text={notice} onClose={() => setNotice(null)} /> : null}
      {circles === null ? <Loading words="Loading your groups…" /> : null}
      {draft ? (
        <Card>
          <Txt variant="title" role="header">New group</Txt>
          <Field label="Name of the group" value={draft.name} onChangeText={(name) => edit({ name, need: draft.need === 'name' ? null : draft.need })} placeholder={'Like "Chase\'s birthday"'} maxLength={60} />
          {draft.need === 'name' ? <Txt variant="strong">Type a name for the group first.</Txt> : null}
          <Choice
            kind="checkbox"
            label="This group is for an event"
            title="This group is for an event"
            detail="Like a birthday or a trip. People in it read each other's comments on its photos."
            checked={draft.event}
            onPress={() => edit({ event: !draft.event, mode: draft.event ? 'private' : 'on_group_posts' })}
          />
          <Txt variant="title" role="header">Who is in it?</Txt>
          {groups.filter((g) => relativesIn(g).length > 0).map((g) => (
            <Button key={g.circle_id} label={`Add everyone from ${g.name}`} variant="secondary" onPress={() => copyFrom(g)} />
          ))}
          {draft.copied.map((n) => <Txt key={n} variant="muted">{`People you add to ${n} later won't be added here.`}</Txt>)}
          {relatives.map((p) => (
            <Choice key={p.user_id} kind="checkbox" label={p.name} title={p.name} checked={draft.ticked.includes(p.user_id)} onPress={() => tick(p.user_id)} />
          ))}
          <Txt variant="title" role="header">Who reads their comments?</Txt>
          {MODES.map((m) => (
            <Choice key={m.mode} kind="radio" label={m.title} title={m.title} detail={m.detail} checked={draft.mode === m.mode} onPress={() => edit({ mode: m.mode })} />
          ))}
          {draft.mode === 'always' ? (
            <Txt variant="strong">{alwaysWords(relatives.filter((p) => draft.ticked.includes(p.user_id)).map((p) => p.name), draft.name.trim() || 'this group')}</Txt>
          ) : null}
          <Txt variant="title" role="header">Should they see photos already shared?</Txt>
          <Choice
            kind="radio"
            label="Share all past photos"
            title="Share all past photos"
            detail="They'll see every photo sent to this group, even from before they were added."
            checked={draft.history === 'all'}
            onPress={() => edit({ history: 'all', need: null })}
          />
          <Choice
            kind="radio"
            label="Only new photos"
            title="Only new photos"
            detail="They'll see photos sent to this group from today on."
            checked={draft.history === 'new'}
            onPress={() => edit({ history: 'new', need: null })}
          />
          {draft.need === 'history' ? <Txt variant="strong">Pick one above first.</Txt> : null}
          <Button label="Make the group" onPress={() => void makeGroup()} softDisabled={!draft.name.trim() || !draft.history} busy={draft.busy} />
          <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} />
        </Card>
      ) : (
        <Button label="New group" onPress={() => { closeForm(); setDraft(NEW_GROUP); }} />
      )}
      {/* one main action per screen: while making a group, the list waits */}
      {(draft ? [] : circles ?? []).map((g) => (
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
          {g.kind !== 'everyone' && g.comment_mode ? (
            <>
              <Txt variant="strong">Who reads their comments?</Txt>
              {MODES.map((m) => (
                <Choice
                  key={m.mode}
                  kind="radio"
                  label={`${m.title} for ${g.name}`}
                  title={m.title}
                  detail={m.detail}
                  checked={g.comment_mode === m.mode}
                  onPress={() => pickMode(g, m.mode)}
                />
              ))}
              {confirming === g.circle_id ? (
                <Card>
                  <Txt variant="strong">{alwaysWords(relativesIn(g), g.name)}</Txt>
                  <Txt>As now, the parents and whoever posted a photo read every comment on it.</Txt>
                  <Button label="Turn on Always shared" onPress={() => void setMode(g, 'always')} />
                  <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} />
                </Card>
              ) : null}
            </>
          ) : null}
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
              <Txt variant="title" role="header">{`Invite someone to ${g.name}`}</Txt>
              <Field label="Their name, the way your family says it" value={inviteName} onChangeText={setInviteName} placeholder='Like "Grandma June"' maxLength={40} />
              <Txt variant="muted">They'll see this name on Hearth and won't have to type it.</Txt>
              {/* GRP-18: Everyone first and ticked; any other groups can be ticked too */}
              {everyone && everyone.circle_id !== g.circle_id ? (
                <Choice
                  kind="checkbox"
                  label="Also add them to Everyone"
                  title="Also add them to Everyone"
                  detail={`They'll see photos sent to Everyone. Untick this if they should see only ${g.name}.`}
                  checked={alsoEveryone}
                  onPress={() => setAlsoEveryone((v) => !v)}
                />
              ) : null}
              {groups.filter((o) => o.circle_id !== g.circle_id).map((o) => (
                <Choice
                  key={o.circle_id}
                  kind="checkbox"
                  label={`Also add them to ${o.name}`}
                  title={`Also add them to ${o.name}`}
                  checked={alsoIn.includes(o.circle_id)}
                  onPress={() => setAlsoIn((cur) => (cur.includes(o.circle_id) ? cur.filter((x) => x !== o.circle_id) : [...cur, o.circle_id]))}
                />
              ))}
              <Txt variant="title" role="header">Should they see photos already shared?</Txt>
              <Choice
                kind="radio"
                label="Share all past photos"
                title="Share all past photos"
                detail={`They'll see every photo ${g.name} can already see.`}
                checked={history === 'all'}
                onPress={() => { setHistory('all'); setNeedHistory(false); }}
              />
              <Choice
                kind="radio"
                label="Only new photos"
                title="Only new photos"
                detail="They'll see photos shared from today on, including older photos you add later."
                checked={history === 'new'}
                onPress={() => { setHistory('new'); setNeedHistory(false); }}
              />
              {needHistory ? <Txt variant="strong">Pick one above first.</Txt> : null}
              <Button label="Make the invite" onPress={() => void makeInvite(g.circle_id)} softDisabled={!history} />
              <Button label="Cancel" variant="secondary" onPress={closeForm} />
            </>
          ) : invitable(g) ? (
            <Button label={`Invite someone to ${g.name}`} text="Invite someone" variant="secondary" onPress={() => { closeForm(); setAsking(g.circle_id); }} />
          ) : (
            <Txt variant="muted">To invite someone, use their household below.</Txt>
          )}
        </Card>
      ))}
    </Screen>
  );
}
