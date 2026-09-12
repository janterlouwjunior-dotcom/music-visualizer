/**
 * Serializes async read-modify-write operations against a shared file.
 * Without this, two near-simultaneous mutations (e.g. two quick deletes) can
 * each read the file before either writes, and the second write silently
 * clobbers the first's change. Each JSON-file-backed store should own one
 * queue instance and run every mutation through it.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}
