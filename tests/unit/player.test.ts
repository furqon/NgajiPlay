import { beforeEach, describe, expect, it } from 'vitest';
import {
  Player,
  REPEAT_CYCLE,
  nextRepeatMode,
  type AudioLike,
} from '../../src/playback/player';
import { readResume, trackResume } from '../../src/playback/resume';
import { clearAll, putClip } from '../../src/store/db';
import type { Clip } from '../../src/types';

/** Just enough of an audio element to drive the player without a browser. */
class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  plays = 0;

  onended: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  ondurationchange: (() => void) | null = null;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play(): Promise<void> {
    this.plays += 1;
    this.paused = false;
    this.onplay?.();
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
    this.onpause?.();
  }

  /** What the browser does once it knows the length. */
  metadata(seconds: number): void {
    this.duration = seconds;
    this.ondurationchange?.();
  }

  tick(seconds: number): void {
    this.currentTime = seconds;
    this.ontimeupdate?.();
  }

  end(): void {
    this.paused = true;
    this.onended?.();
  }
}

function clip(id: string, overrides: Partial<Clip> = {}): Clip {
  const [page, surah] = id.split(':').map(Number);
  return {
    id,
    page: page ?? 1,
    surah: surah ?? 1,
    ayahStart: 1,
    ayahEnd: 7,
    mimeType: 'audio/webm;codecs=opus',
    bytes: 2048,
    durationMs: 2_000,
    createdAt: 0,
    updatedAt: 0,
    displayName: `Rekaman ${id}`,
    ...overrides,
  };
}

function setup(clips: Clip[] = [clip('1:1'), clip('2:2'), clip('3:3')]) {
  const audio = new FakeAudio();
  const blobs = new Map(clips.map((item) => [item.id, new Blob(['audio'])]));
  const created: string[] = [];
  const revoked: string[] = [];
  let count = 0;

  const player = new Player({
    createAudio: () => audio,
    loadBlob: async (id) => blobs.get(id),
    createObjectUrl: () => {
      const url = `blob:test-${++count}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => revoked.push(url),
  });

  return { player, audio, created, revoked, clips, blobs };
}

describe('repeat modes', () => {
  it('cycles off → one → all → 2 → 3 → 5 → 10 → off (FR-5.2)', () => {
    expect(REPEAT_CYCLE).toEqual(['off', 'one', 'all', 2, 3, 5, 10]);
    let mode = 'off' as ReturnType<typeof nextRepeatMode>;
    const seen: Array<typeof mode> = [];
    for (let step = 0; step < REPEAT_CYCLE.length; step += 1) {
      mode = nextRepeatMode(mode);
      seen.push(mode);
    }
    expect(seen).toEqual(['one', 'all', 2, 3, 5, 10, 'off']);
  });
});

describe('Player', () => {
  it('uses exactly one audio element for the whole session (FR-5.5)', async () => {
    let audioCount = 0;
    const audio = new FakeAudio();
    const player = new Player({
      createAudio: () => {
        audioCount += 1;
        return audio;
      },
      loadBlob: async () => new Blob(['audio']),
      createObjectUrl: () => 'blob:x',
      revokeObjectUrl: () => undefined,
    });
    const clips = [clip('1:1'), clip('2:2')];

    await player.play(clips, '1:1');
    await player.play(clips, '2:2');

    expect(audioCount).toBe(1);
  });

  it('plays a clip from playlist order and exposes its metadata (FR-5.1, FR-5.3)', async () => {
    const { player, audio } = setup();
    const states: string[] = [];
    player.subscribe((state) => states.push(`${state.status}:${state.clip?.id ?? '-'}`));

    await player.play([clip('1:1'), clip('2:2')], '2:2');

    expect(player.state.clip?.id).toBe('2:2');
    expect(player.state.index).toBe(1);
    expect(player.state.playing).toBe(true);
    expect(player.state.queue.map((item) => item.id)).toEqual(['1:1', '2:2']);
    expect(audio.src).toMatch(/^blob:/);
    expect(states).toContain('ready:2:2');
  });

  it('toggles between play and pause', async () => {
    const { player, audio } = setup();
    await player.play([clip('1:1')], '1:1');
    expect(audio.paused).toBe(false);

    player.toggle();
    expect(audio.paused).toBe(true);
    expect(player.state.playing).toBe(false);

    player.toggle();
    expect(audio.paused).toBe(false);
    expect(player.state.playing).toBe(true);
  });

  it('moves next and previous, wrapping at both ends', async () => {
    const { player } = setup();
    const clips = [clip('1:1'), clip('2:2'), clip('3:3')];
    await player.play(clips, '1:1');

    player.previous();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('3:3');

    player.next();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('1:1');
  });

  it('advances to the next clip when one ends, and stops at the end of the playlist', async () => {
    const { player, audio } = setup([clip('1:1'), clip('2:2')]);
    await player.play([clip('1:1'), clip('2:2')], '1:1');

    audio.end();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('2:2');
    expect(player.state.playing).toBe(true);

    audio.end();
    await Promise.resolve();
    // Nothing follows, and repeat is off.
    expect(player.state.clip?.id).toBe('2:2');
    expect(player.state.playing).toBe(false);
  });

  it('repeat one replays the same clip instead of advancing', async () => {
    const { player, audio } = setup([clip('1:1'), clip('2:2')]);
    await player.play([clip('1:1'), clip('2:2')], '1:1');
    player.setRepeat('one');

    audio.tick(1.9);
    audio.end();
    await Promise.resolve();

    expect(player.state.clip?.id).toBe('1:1');
    expect(audio.currentTime).toBe(0);
    expect(player.state.playing).toBe(true);
  });

  it('repeat all wraps from the last clip back to the first', async () => {
    const { player, audio } = setup([clip('1:1'), clip('2:2')]);
    await player.play([clip('1:1'), clip('2:2')], '2:2');
    player.setRepeat('all');

    audio.end();
    await Promise.resolve();

    expect(player.state.clip?.id).toBe('1:1');
    expect(player.state.playing).toBe(true);
  });

  it('repeats a temporary playlist as a whole, then stops after the last pass', async () => {
    const clips = [clip('1:1'), clip('2:2')];
    const { player, audio } = setup(clips);
    await player.play(clips, '1:1', { playlistRepeat: 2 });

    expect(player.state.playlistRepeat).toBe(2);
    expect(player.state.playlistPass).toBe(1);

    audio.end();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('2:2');

    audio.end();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('1:1');
    expect(player.state.playlistPass).toBe(2);
    expect(player.state.playing).toBe(true);

    audio.end();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('2:2');

    audio.end();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('2:2');
    expect(player.state.playing).toBe(false);
  });

  it('a normal library play resets the temporary-playlist repeat to once', async () => {
    const clips = [clip('1:1'), clip('2:2')];
    const { player } = setup(clips);

    await player.play(clips, '1:1', { playlistRepeat: 3 });
    expect(player.state.playlistRepeat).toBe(3);

    await player.play(clips, '2:2');
    expect(player.state.playlistRepeat).toBe(1);
    expect(player.state.playlistPass).toBe(1);
  });

  it('repeat 2 plays each clip of a three-clip playlist twice, then advances', async () => {
    const clips = [clip('1:1'), clip('2:2'), clip('3:3')];
    const { player, audio } = setup(clips);
    await player.play(clips, '1:1');
    player.setRepeat(2);

    const order: string[] = ['1:1'];
    for (let play = 0; play < 6; play += 1) {
      audio.end();
      await Promise.resolve();
      order.push(player.state.clip?.id ?? '-');
    }

    // AABBCC: each clip twice in playlist order, then the queue stops.
    expect(order).toEqual(['1:1', '1:1', '2:2', '2:2', '3:3', '3:3', '3:3']);
    expect(player.state.playing).toBe(false);
  });

  it('repeat 2 on the last clip stops after the second play', async () => {
    const { player, audio } = setup([clip('1:1'), clip('2:2')]);
    await player.play([clip('1:1'), clip('2:2')], '2:2');
    player.setRepeat(2);

    audio.end();
    await Promise.resolve();
    expect(player.state.playing).toBe(true);

    audio.end();
    await Promise.resolve();
    expect(player.state.clip?.id).toBe('2:2');
    expect(player.state.playing).toBe(false);
  });

  it('revokes the previous blob URL when the clip changes', async () => {
    const { player, created, revoked } = setup([clip('1:1'), clip('2:2')]);
    await player.play([clip('1:1'), clip('2:2')], '1:1');
    const first = created[0]!;

    player.next();
    await Promise.resolve();

    expect(revoked).toContain(first);
    expect(created).toHaveLength(2);
  });

  it('reports an error instead of playing a clip whose audio is gone', async () => {
    const { player, blobs } = setup([clip('1:1')]);
    blobs.delete('1:1');

    await player.play([clip('1:1')], '1:1');

    expect(player.state.status).toBe('error');
    expect(player.state.playing).toBe(false);
  });

  it('takes the real duration from the element and applies a resume position (FR-5.4)', async () => {
    const { player, audio } = setup([clip('1:1')]);

    await player.restore([clip('1:1')], '1:1', 4_000);
    expect(audio.paused).toBe(true);
    expect(player.state.playing).toBe(false);

    // Duration from the file wins over the stored estimate, then the seek lands.
    audio.metadata(12.5);
    expect(player.state.durationMs).toBe(12_500);
    expect(audio.currentTime).toBe(4);
    expect(player.state.positionMs).toBe(4_000);
  });

  it('clamps a resume position that is past the end of a shorter clip', async () => {
    const { player, audio } = setup([clip('1:1')]);

    await player.restore([clip('1:1')], '1:1', 9_000);
    audio.metadata(3);

    expect(audio.currentTime).toBe(3);
    expect(player.state.positionMs).toBe(3_000);
  });

  it('tracks elapsed time from the element', async () => {
    const { player, audio } = setup([clip('1:1')]);
    await player.play([clip('1:1')], '1:1');

    audio.metadata(10);
    audio.tick(2.4);

    expect(player.state.positionMs).toBe(2_400);
  });

  it('restarts a finished clip when play is pressed again', async () => {
    const { player, audio } = setup([clip('1:1')]);
    await player.play([clip('1:1')], '1:1');
    audio.metadata(2);
    audio.end();

    player.playCurrent();

    expect(audio.currentTime).toBe(0);
    expect(player.state.playing).toBe(true);
  });

  it('keeps working after the playing clip is deleted from the queue', async () => {
    const { player } = setup([clip('1:1'), clip('2:2')]);
    const remaining = [clip('2:2')];
    await player.play([clip('1:1'), clip('2:2')], '1:1');

    player.setQueue(remaining);
    expect(player.state.queue.map((item) => item.id)).toEqual(['2:2']);

    player.next();
    await Promise.resolve();

    expect(player.state.clip?.id).toBe('2:2');
  });
});

describe('resume bookmark', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('has nothing to restore on a first visit', async () => {
    expect(await readResume()).toBeNull();
  });

  it('saves the clip, throttles to five seconds and writes again on pause (FR-5.4)', async () => {
    const stored = clip('2:2');
    await putClip(stored, new Blob(['audio']));

    const audio = new FakeAudio();
    const player = new Player({
      createAudio: () => audio,
      loadBlob: async () => new Blob(['audio']),
      createObjectUrl: () => 'blob:x',
      revokeObjectUrl: () => undefined,
    });
    const stop = trackResume(player);

    await player.play([stored], '2:2');
    audio.tick(1);
    audio.tick(3);
    audio.tick(5);
    audio.tick(6);
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Writes once per five-second bucket: 6 s of audio leaves 5 s stored.
    expect(await readResume()).toEqual({ clipId: '2:2', positionMs: 5_000 });

    player.pause();
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Pausing always writes, whatever the bucket.
    expect(await readResume()).toEqual({ clipId: '2:2', positionMs: 6_000 });
    stop();
  });
});
