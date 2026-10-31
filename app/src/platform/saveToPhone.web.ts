// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// Web build is a test harness only (no web viewer in the beta): download the file.
export type SaveResult = 'saved' | 'denied';

export async function saveToPhone(bytes: Uint8Array, name: string): Promise<SaveResult> {
  const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
