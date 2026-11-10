import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  StorageQuotaError,
  ensureSpace,
  estimateStorage,
  isQuotaExceeded,
  requestPersistence,
} from '../../src/store/storage';

function stubStorage(estimate: { usage: number; quota: number } | null, persist = true) {
  vi.stubGlobal('navigator', {
    storage: {
      estimate: async () => (estimate ? estimate : undefined),
      persist: async () => persist,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('estimateStorage', () => {
  it('reports usage, quota and what is left', async () => {
    stubStorage({ usage: 2_000_000, quota: 10_000_000 });
    expect(await estimateStorage()).toEqual({ usage: 2_000_000, quota: 10_000_000, available: 8_000_000 });
  });

  it('does not go negative when usage exceeds quota', async () => {
    stubStorage({ usage: 12, quota: 10 });
    expect((await estimateStorage()).available).toBe(0);
  });

  it('tolerates browsers without the Storage API', async () => {
    stubStorage(null);
    expect(await estimateStorage()).toEqual({ usage: 0, quota: 0, available: 0 });
  });
});

describe('ensureSpace', () => {
  it('allows a save that fits', async () => {
    stubStorage({ usage: 1_000_000, quota: 10_000_000 });
    await expect(ensureSpace(500_000)).resolves.toBeUndefined();
  });

  it('refuses a save that does not fit, with the numbers attached (FR-2.8)', async () => {
    stubStorage({ usage: 9_500_000, quota: 10_000_000 });
    const error = await ensureSpace(900_000).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageQuotaError);
    expect(error).toMatchObject({ name: 'StorageQuotaError', availableBytes: 500_000 });
  });

  it('lets IndexedDB decide when the browser reports no quota', async () => {
    stubStorage({ usage: 0, quota: 0 });
    await expect(ensureSpace(Number.MAX_SAFE_INTEGER)).resolves.toBeUndefined();
  });
});

describe('persistence and quota detection', () => {
  it('reports whether storage was persisted (FR-4.6)', async () => {
    stubStorage({ usage: 1, quota: 2 }, true);
    expect(await requestPersistence()).toBe(true);
  });

  it('recognises a quota DOMException', () => {
    expect(isQuotaExceeded(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceeded(new Error('full'))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});
