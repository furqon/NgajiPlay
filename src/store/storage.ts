/** Raised when a save would exceed the browser's storage quota (FR-2.8). */
export class StorageQuotaError extends Error {
  constructor(
    readonly requiredBytes: number,
    readonly availableBytes: number,
  ) {
    super(`Not enough storage: need ${requiredBytes} B, ${availableBytes} B available`);
    this.name = 'StorageQuotaError';
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  available: number;
}

/** Throws a StorageQuotaError rather than a raw DOMException. */
export function isQuotaExceeded(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export async function estimateStorage(): Promise<StorageEstimate> {
  const estimate = await navigator.storage?.estimate?.();
  const usage = estimate?.usage ?? 0;
  const quota = estimate?.quota ?? 0;
  return { usage, quota, available: Math.max(0, quota - usage) };
}

/**
 * Asks the browser to keep this origin's data instead of evicting it under
 * pressure (FR-4.6). Not all browsers grant it, and iOS ignores it, so the
 * result is reported rather than treated as a failure.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** Refuses the save when the clip cannot fit, instead of failing mid-write. */
export async function ensureSpace(requiredBytes: number): Promise<void> {
  const { quota, available } = await estimateStorage();
  // Without a usable estimate (some browsers report 0) let IndexedDB decide.
  if (quota === 0) return;
  if (requiredBytes > available) throw new StorageQuotaError(requiredBytes, available);
}
