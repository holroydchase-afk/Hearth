// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
//
// The three things a product plugs in: a Relay (the server that passes opaque MLS bytes along), a Roster (who
// belongs in a conversation) and a Store (this device's keys and history, which the product must encrypt at rest).
// Nothing here knows about any product's groups, families or crews.

/** What the relay keeps per row. `body` is base64 MLS bytes the server can't open. */
export type RelayRowKind = 'commit' | 'welcome' | 'message';

export interface RelayRow {
  id: number;
  sender_id: string | null;
  kind: RelayRowKind;
  epoch: number;
  body: string;
  created_at: string;
}

export interface ClaimedKeyPackage {
  user_id: string;
  key_package: string;
}

/**
 * The server side. Every call is for the signed-in user, and every conversation call must fail ("not found") when
 * that user isn't in the conversation. `relay/supabase.sql` is a ready-made Postgres version.
 */
export interface Relay {
  /** Replace this user's device: its public signing key and a batch of one-use key packages (base64). */
  publishDevice(signatureKey: string, keyPackages: string[]): Promise<void>;
  /** How many of this user's key packages are still unused on the server. */
  keyPackageCount(): Promise<number>;
  /** true if this call created the conversation's group (this device makes it), false if someone already had. */
  start(conversation: string): Promise<boolean>;
  /** Use up one key package for each listed person who is in the conversation. */
  claim(conversation: string, users: string[]): Promise<ClaimedKeyPackage[]>;
  /**
   * Store one row and return its id. A welcome names its recipient; nothing else does.
   * A second commit for the same epoch must reject with `EpochConflict` (or an error `isEpochConflict` accepts).
   */
  send(conversation: string, kind: RelayRowKind, epoch: number, body: string, recipient?: string): Promise<number>;
  /** Rows after `after`, oldest first: only those since this user joined, and welcomes only for them. */
  fetch(conversation: string, after: number, limit: number): Promise<RelayRow[]>;
}

export interface RosterMember {
  user_id: string;
  /** The name shown beside their messages. */
  name: string;
  /** Their device's public signing key (base64), or null until they've opened the messenger once. */
  signature_key: string | null;
}

/**
 * Who belongs in a conversation right now. The engine adds and removes devices to match it, so it must come from
 * the server the relay trusts (in the Supabase template, the same membership rule the relay enforces).
 */
export interface Roster {
  members(conversation: string): Promise<RosterMember[]>;
}

/** Key-value storage for this device. Holds private keys and decrypted history: encrypt it at rest. */
export interface Store {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface Line {
  id: number;
  sender_id: string;
  name: string;
  text: string;
  at: string;
  mine: boolean;
}

/** ready: in the group. waiting: this device isn't let in yet (someone already in has to open the conversation). */
export type Status = 'ready' | 'waiting';

export interface View {
  status: Status;
  lines: Line[];
}

/** Thrown by a Relay when another device already committed this epoch. The engine catches up and retries. */
export class EpochConflict extends Error {
  constructor() {
    super('another device changed the keys first');
    this.name = 'EpochConflict';
  }
}
