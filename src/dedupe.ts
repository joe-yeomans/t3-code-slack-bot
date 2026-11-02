const ONE_HOUR_MS = 60 * 60 * 1000;

/** Returns a function that is true the first time it sees a key, and false for repeats within the window. */
export function createFirstSeen(windowMs = ONE_HOUR_MS, now: () => number = Date.now) {
  const seen = new Map<string, number>(); // Insertion order is oldest first.

  return (key: string): boolean => {
    const time = now();
    for (const [oldKey, firstSeen] of seen) {
      if (time - firstSeen < windowMs) break;
      seen.delete(oldKey);
    }
    if (seen.has(key)) return false;
    seen.set(key, time);
    return true;
  };
}
