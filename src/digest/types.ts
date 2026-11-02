// Plan morning-digest § 1. The contract every part of the digest codes against: the reader
// produces a Night, the page and the JSON render it. No logic here.

/** The `status` of one line in a night's run log. */
export type JobStatus = 'ok' | 'retry' | 'fail';

/** One job's night, folded from all of its lines in the run log. */
export type DigestRow = {
  /** The job's name, as logged. */
  job: string;
  /** Whose job it is; `null` when the log has none (rendered as `—`). */
  owner: string | null;
  /** Lines logged for this job. */
  runs: number;
  /** Of those, lines with status `retry`. */
  retries: number;
  /** Status of the job's last line. */
  lastStatus: JobStatus;
  /**
   * The most recent `error` logged for this job, on any line (a retry's error stays after a
   * later `ok`); `null` when the job never logged one.
   */
  lastError: string | null;
  /** `at` of the job's first line: the log's own string, offset kept, never converted. */
  firstAt: string;
  /** `at` of the job's last line: the log's own string, offset kept, never converted. */
  lastAt: string;
  /** Needs a look: `retries >= 3`, or any line of this job with status `fail`. */
  marked: boolean;
};

/** One night's digest: `runs/<night>.jsonl`, read. */
export type Night = {
  /** The night, `YYYY-MM-DD`. */
  night: string;
  /** One row per job, sorted by `job`. Empty when the file is empty. */
  rows: DigestRow[];
  /**
   * Lines that didn't parse or aren't the expected shape (blank lines are skipped, not
   * counted). Counted, never thrown.
   */
  badLines: number;
  /** Lines per status, counted per log line. Bad lines are in no count. */
  counts: { ok: number; retry: number; fail: number };
};

/**
 * Reads `<runsDir>/<night>.jsonl` into a Night.
 * `null` means there is no file for that night; an empty file is a Night with no rows.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
