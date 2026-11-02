import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, Night } from '../src/digest/types.js';

// Plan morning-digest § 2d. Routes from #3 (page) and #4 (JSON), read by #2 (readNight).
// Fixtures live in a temp runs dir: runs/ holds real nights and is read-only.
const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const line = (o: Record<string, unknown>) => JSON.stringify(o);

// A normal night, written out of job order so the sort shows.
writeFileSync(
  join(runsDir, '2026-10-30.jsonl'),
  [
    line({ at: '2026-10-30T23:00:02+01:00', job: 'notes/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' }),
    line({ at: '2026-10-31T01:30:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: null, error: 'upstream 503' }),
    line({ at: '2026-10-31T01:31:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: null, error: 'upstream 503' }),
    line({ at: '2026-10-31T01:33:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
    line({ at: '2026-10-31T01:34:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: null, error: 'upstream 503' }),
    line({ at: '2026-10-31T01:37:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: null }),
    line({ at: '2026-10-31T02:00:05+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
  ].join('\n') + '\n',
);

// An empty night: the file is there, zero bytes.
writeFileSync(join(runsDir, '2026-10-31.jsonl'), '');

// A night with one truncated line at the end.
writeFileSync(
  join(runsDir, '2026-11-01.jsonl'),
  [
    line({ at: '2026-11-01T23:00:02+01:00', job: 'rig/rotate-logs', status: 'ok', owner: 'lane-07' }),
    line({ at: '2026-11-02T00:00:04+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
    '{"at":"2026-11-02T05:59:58+01:00","job":"lane/sy',
  ].join('\n') + '\n',
);

// 2026-11-02: no file on purpose.

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
const app = createApp(config);

/** The table rows that carry data (`<td>`s), as attribute string + inner HTML. */
function dataRows(html: string): { attrs: string; body: string }[] {
  return [...html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)]
    .filter((m) => m[2].includes('<td'))
    .map((m) => ({ attrs: m[1], body: m[2] }));
}

const isWarn = (attrs: string) => /class="[^"]*\bwarn\b[^"]*"/.test(attrs);

/** Every row names exactly one of `jobs`; returns them in page order. */
function jobsOnPage(html: string, jobs: string[]): string[] {
  return dataRows(html).map((r) => {
    const named = jobs.filter((j) => r.body.includes(j));
    expect(named).toHaveLength(1);
    return named[0];
  });
}

async function page(night: string) {
  const res = await app.request(`/digest/${night}`);
  return { status: res.status, html: await res.text() };
}

async function json(night: string) {
  const res = await app.request(`/api/digest/${night}`);
  return { status: res.status, body: (await res.json()) as unknown };
}

const normalRows: DigestRow[] = [
  {
    job: 'fixtures/refresh',
    owner: null,
    runs: 4,
    retries: 3,
    lastStatus: 'ok',
    lastError: 'upstream 503',
    firstAt: '2026-10-31T01:30:00+01:00',
    lastAt: '2026-10-31T01:37:00+01:00',
    marked: true,
  },
  {
    job: 'lane/sync',
    owner: 'rook',
    runs: 2,
    retries: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-31T01:33:00+01:00',
    lastAt: '2026-10-31T02:00:05+01:00',
    marked: false,
  },
  {
    job: 'notes/backup',
    owner: 'lane-07',
    runs: 1,
    retries: 0,
    lastStatus: 'fail',
    lastError: 'quota exceeded',
    firstAt: '2026-10-30T23:00:02+01:00',
    lastAt: '2026-10-30T23:00:02+01:00',
    marked: true,
  },
];

describe('GET /digest/:night (page)', () => {
  it('renders a night with a file: one row per job, sorted, marked rows warned', async () => {
    const { status, html } = await page('2026-10-30');
    expect(status).toBe(200);
    expect(html).toContain('<h1>digest · 2026-10-30</h1>');

    const rows = dataRows(html);
    expect(rows).toHaveLength(3);
    expect(jobsOnPage(html, normalRows.map((r) => r.job))).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup']);
    expect(rows.map((r) => isWarn(r.attrs))).toEqual([true, false, true]);

    // owner null on fixtures/refresh, error null on lane/sync: both shown as —
    expect(rows[0].body).toContain('—');
    expect(rows[1].body).toContain('—');
  });

  it('returns 404 for a night with no file', async () => {
    const { status, html } = await page('2026-11-02');
    expect(status).toBe(404);
    expect(html).toContain('no run log for this night');
  });

  it('renders "nothing ran" for an empty night', async () => {
    const { status, html } = await page('2026-10-31');
    expect(status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(dataRows(html)).toHaveLength(0);
  });

  it('still renders a night with a bad line, and says so', async () => {
    const { status, html } = await page('2026-11-01');
    expect(status).toBe(200);
    expect(html).toContain('1 bad line skipped');
    expect(jobsOnPage(html, ['lane/sync', 'rig/rotate-logs'])).toEqual(['lane/sync', 'rig/rotate-logs']);
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns the night with rows sorted by job', async () => {
    const { status, body } = await json('2026-10-30');
    expect(status).toBe(200);
    expect(body).toEqual({
      night: '2026-10-30',
      rows: normalRows,
      badLines: 0,
      counts: { ok: 3, retry: 3, fail: 1 },
    } satisfies Night);
  });

  it('returns 404 for a night with no file', async () => {
    const { status, body } = await json('2026-11-02');
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'no run log for this night', night: '2026-11-02' });
  });

  it('returns no rows for an empty night', async () => {
    const { status, body } = await json('2026-10-31');
    expect(status).toBe(200);
    expect(body).toEqual({
      night: '2026-10-31',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    } satisfies Night);
  });

  it('counts the bad line and keeps the good ones', async () => {
    const { status, body } = await json('2026-11-01');
    expect(status).toBe(200);
    const n = body as Night;
    expect(n.badLines).toBe(1);
    expect(n.rows.map((r) => r.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(n.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-10-30', '2026-10-31', '2026-11-01'])('same jobs in the same order for %s', async (night) => {
    const [p, j] = await Promise.all([page(night), json(night)]);
    expect(p.status).toBe(200);
    expect(j.status).toBe(200);
    const jobs = (j.body as Night).rows.map((r) => r.job);
    expect(jobsOnPage(p.html, jobs)).toEqual(jobs);
  });
});
