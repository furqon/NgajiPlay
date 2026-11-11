import { getSetting, setSetting } from '../store/db';
import type { Player } from './player';

/** Where the listener left off (FR-5.4). */
export interface ResumePoint {
  clipId: string;
  positionMs: number;
}

const CLIP_KEY = 'lastClipId';
const POSITION_KEY = 'lastPositionMs';
const SAVE_EVERY_MS = 5_000;

/** The settings schema in `types.ts` already names these two keys. */
export async function readResume(): Promise<ResumePoint | null> {
  const [clipId, positionMs] = await Promise.all([
    getSetting<string | null>(CLIP_KEY, null),
    getSetting<number>(POSITION_KEY, 0),
  ]);
  return clipId ? { clipId, positionMs: Math.max(0, positionMs) } : null;
}

/**
 * Saves the bookmark at most once per five seconds of audio, plus on every
 * play/pause change, instead of on every `timeupdate` (four writes a second).
 */
export function trackResume(player: Player): () => void {
  let lastKey = '';

  return player.subscribe((state) => {
    if (!state.clip) return;
    const bucket = Math.floor(state.positionMs / SAVE_EVERY_MS);
    const key = `${state.clip.id}|${bucket}|${state.playing}`;
    if (key === lastKey) return;
    lastKey = key;

    void Promise.all([
      setSetting(CLIP_KEY, state.clip.id),
      setSetting(POSITION_KEY, state.positionMs),
    ]).catch(() => {
      // A lost bookmark is a small loss; it must never interrupt playback.
    });
  });
}
