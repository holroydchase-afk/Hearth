// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Chase Holroyd
// RD-1/RD-2: the README and case study are what a recruiter reads next to the demo; their numbers and links must stay true.
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const DEMO = 'https://chaseholroyd.com/demo/hearth/';

describe('portfolio claims', () => {
  it('RD-1 the case study never claims more decisions than the log has, and is no more than 10 behind', () => {
    const log = read('docs/product/DECISION-LOG.md');
    const n = new Set(log.match(/DEC-\d+/g)).size;
    const said = Number(/(\d+) decisions/.exec(read('docs/portfolio/CASE-STUDY.md'))?.[1]);
    expect(said).toBeLessThanOrEqual(n);
    expect(said).toBeGreaterThan(n - 10);
  });

  it('RD-2 the README and case study link the published no-login demo', () => {
    expect(read('README.md')).toContain(DEMO);
    expect(read('docs/portfolio/CASE-STUDY.md')).toContain(DEMO);
  });
});
