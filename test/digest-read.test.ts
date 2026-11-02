import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestRow, Night } from '../src/digest/types.js';

// runs/ is read-only: these tests only read it. Everything else goes in a temp dir.
const runsDir = fileURLToPath(new URL('../runs', import.meta.url));

function row(night: Night, job: string): DigestRow {
  const found = night.rows.find((r) => r.job === job);
  if (!found) throw new Error(`no row for ${job}`);
  return found;
}

describe('readNight on runs/', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const night = readNight(runsDir, '2026-10-28');
    expect(night).not.toBeNull();
    if (!night) return;
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });

    expect(row(night, 'digest/render').owner).toBeNull();

    expect(row(night, 'fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
      marked: true,
    });

    expect(row(night, 'lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
      marked: false,
    });

    expect(row(night, 'notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      marked: true,
    });
  });

  it('reads 2026-10-27: 4 jobs, no bad lines', () => {
    const night = readNight(runsDir, '2026-10-27');
    expect(night?.rows).toHaveLength(4);
    expect(night?.badLines).toBe(0);
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when there is no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns a night with no rows for an empty file', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'x.jsonl'), '{"at":"a","job":"j","status":"ok","owner":null}\n');
    expect(readNight(join(dir, 'sub'), '../x')).toBeNull();
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
  });

  it('counts wrong-shape lines as bad and skips blank lines', () => {
    const lines = [
      '{"at":"2026-01-01T23:00:00+01:00","job":"a/job","status":"ok","owner":"rook"}',
      '',
      '   ',
      '{"at":"2026-01-01T23:01:00+01:00","job":"a/job","status":"done","owner":"rook"}',
      '{"at":"2026-01-01T23:02:00+01:00","job":"","status":"ok","owner":"rook"}',
      '{"at":"2026-01-01T23:03:00+01:00","job":"a/job","status":"ok","owner":7}',
      '{"at":"2026-01-01T23:04:00+01:00","job":"a/job","status":"ok","owner":"rook","error":42}',
      '{"job":"a/job","status":"ok","owner":"rook"}',
      '[1,2]',
      'null',
      'not json',
      '',
    ];
    writeFileSync(join(dir, '2026-01-01.jsonl'), lines.join('\n'));
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(8);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(night?.rows).toEqual([
      {
        job: 'a/job',
        owner: 'rook',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-01T23:00:00+01:00',
        lastAt: '2026-01-01T23:00:00+01:00',
        marked: false,
      },
    ]);
  });
});
