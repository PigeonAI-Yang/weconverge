// Deterministic event/decision bookkeeping ids. Pure; injectable clock for tests.
let counter = 0;

/** Monotonic, process-unique event id: wev-<timestamp>-<seq>. Deterministic given `now`. */
export function makeEventId(now: string): string {
  counter += 1;
  return `wev-${now}-${counter}`;
}

/** For tests: reset the counter so ids are fully deterministic. */
export function resetEventIdCounter(): void {
  counter = 0;
}
