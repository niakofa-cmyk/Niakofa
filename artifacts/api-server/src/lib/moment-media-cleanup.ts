/**
 * Remove an expired Moment only after every legacy and universal storage key
 * has been strictly deleted. The caller can retry with the same durable keys
 * while the story row still exists.
 */
export async function deleteMomentAfterStrictMediaCleanup(
  keys: string[],
  deleteStorageKey: (key: string) => Promise<void>,
  deleteMomentRow: () => Promise<unknown>,
): Promise<void> {
  for (const key of keys) await deleteStorageKey(key);
  await deleteMomentRow();
}