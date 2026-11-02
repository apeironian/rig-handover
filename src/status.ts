import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { Night } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightSummary = {
  night: string;
  /** Lines per status, from readNight; `null` when the night can't be read (rendered as `—`). */
  counts: Night['counts'] | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// A night that can't be read must not take the board down: its counts render as `—`.
function countsFor(runsDir: string, night: string): Night['counts'] | null {
  try {
    return readNight(runsDir, night)?.counts ?? null;
  } catch {
    return null;
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({
      night,
      counts: countsFor(config.runsDir, night),
    })),
  };
}
