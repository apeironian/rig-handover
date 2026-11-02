import { describe, expect, it } from 'vitest';
import type { DigestRow, Night } from '../src/digest/types.js';
import { DigestPage } from '../src/views/digest.js';

const row = (over: Partial<DigestRow>): DigestRow => ({
  job: 'job',
  owner: 'ana',
  runs: 1,
  retries: 0,
  lastStatus: 'ok',
  lastError: null,
  firstAt: '2026-10-28T01:00:00+01:00',
  lastAt: '2026-10-28T01:00:00+01:00',
  marked: false,
  ...over,
});

const night = (over: Partial<Night>): Night => ({
  night: '2026-10-28',
  rows: [],
  badLines: 0,
  counts: { ok: 0, retry: 0, fail: 0 },
  ...over,
});

const render = (n: Night) => String(<DigestPage night={n} />);

describe('digest view', () => {
  const html = render(
    night({
      rows: [
        row({ job: 'zeta-sync', owner: null, lastError: null }),
        row({ job: 'alpha-backup', retries: 3, runs: 4, lastStatus: 'ok', lastError: 'timeout <db>', marked: true }),
        row({ job: 'mid-report', firstAt: '2026-10-28T02:10:05-04:00', lastAt: '2026-10-28T02:12:00-04:00' }),
      ],
      badLines: 1,
    }),
  );

  it('renders rows in the given order, without re-sorting', () => {
    const z = html.indexOf('zeta-sync');
    const a = html.indexOf('alpha-backup');
    const m = html.indexOf('mid-report');
    expect(z).toBeGreaterThan(-1);
    expect(z).toBeLessThan(a);
    expect(a).toBeLessThan(m);
  });

  it('has the header columns', () => {
    for (const h of ['job', 'owner', 'runs', 'retries', 'last status', 'last error', 'first', 'last']) {
      expect(html).toContain(`<th>${h}</th>`);
    }
  });

  it('renders null owner and null error as —', () => {
    expect(html).toMatch(/<td>zeta-sync<\/td><td>—<\/td>(<td>[^<]*<\/td>){3}<td>—<\/td>/);
  });

  it('marks marked rows with class="warn" and only those', () => {
    expect(html).toContain('<tr class="warn"><td>alpha-backup</td>');
    expect(html).toContain('<tr><td>zeta-sync</td>');
    expect(html).toContain('<tr><td>mid-report</td>');
  });

  it('escapes text and keeps times as logged', () => {
    expect(html).toContain('timeout &lt;db&gt;');
    expect(html).toContain('<td>2026-10-28T02:10:05-04:00</td><td>2026-10-28T02:12:00-04:00</td>');
  });

  it('shows the bad-line count, singular for 1', () => {
    expect(html).toContain('<p class="warn">1 bad line skipped</p>');
    expect(render(night({ rows: [row({})], badLines: 3 }))).toContain('<p class="warn">3 bad lines skipped</p>');
    expect(render(night({ rows: [row({})] }))).not.toContain('skipped');
  });

  it('renders "nothing ran" for an empty night, no table', () => {
    const empty = render(night({}));
    expect(empty).toContain('<h1>digest · 2026-10-28</h1>');
    expect(empty).toContain('<p class="mute">nothing ran</p>');
    expect(empty).not.toContain('<table');
    expect(render(night({ badLines: 2 }))).toMatch(/nothing ran<\/p><p class="warn">2 bad lines skipped<\/p>/);
  });
});
