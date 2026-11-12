import { getClip } from '../store/db';
import type { Clip } from '../types';

/**
 * Repeat mode (FR-5.2). A number means "play each clip this many times before
 * moving on", the drill a child actually needs; `all` loops the playlist
 * forever and `one` loops the current clip forever.
 */
export type RepeatMode = 'off' | 'one' | 'all' | number;

/** Cycle order for the bar's single repeat button. */
export const REPEAT_CYCLE: readonly RepeatMode[] = ['off', 'one', 'all', 2, 3, 5, 10];

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  const index = REPEAT_CYCLE.indexOf(mode);
  return REPEAT_CYCLE[(index + 1) % REPEAT_CYCLE.length] ?? 'off';
}

/** Only what the player needs from an audio element, so it can be faked. */
export interface AudioLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  onended: (() => void) | null;
  ontimeupdate: (() => void) | null;
  ondurationchange: (() => void) | null;
  onplay: (() => void) | null;
  onpause: (() => void) | null;
  onerror: (() => void) | null;
}

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PlayerState {
  /** Playlist order, as handed over by the library (REQ §4). */
  queue: readonly Clip[];
  clip: Clip | null;
  index: number;
  status: PlayerStatus;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  repeat: RepeatMode;
  /** Times the current clip has been started; numeric repeat counts on it. */
  plays: number;
  playlistRepeat: number;
  playlistPass: number;
}

export interface PlayerOptions {
  createAudio?: () => AudioLike;
  loadBlob?: (clipId: string) => Promise<Blob | undefined>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

/**
 * Hidden but in the document: iOS Safari is known to drop playback for media
 * elements that were never attached, and an attached element also appears in
 * remote-control lists (FR-5.6).
 */
function browserAudio(): AudioLike {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.hidden = true;
  document.body.append(audio);
  return audio as unknown as AudioLike;
}

const INITIAL: PlayerState = {
  queue: [],
  clip: null,
  index: -1,
  status: 'idle',
  playing: false,
  positionMs: 0,
  durationMs: 0,
  repeat: 'off',
  plays: 1,
  playlistRepeat: 1,
  playlistPass: 1,
};

/**
 * One audio element for the whole app (FR-5.5), so playback survives every
 * route change: views are thrown away, this is not.
 */
export class Player {
  readonly #audio: AudioLike;
  readonly #loadBlob: (clipId: string) => Promise<Blob | undefined>;
  readonly #createObjectUrl: (blob: Blob) => string;
  readonly #revokeObjectUrl: (url: string) => void;
  readonly #listeners = new Set<(state: PlayerState) => void>();

  #state: PlayerState = INITIAL;
  #url: string | null = null;
  /** Bumped on every load, so a slow blob can never replace a newer clip. */
  #token = 0;
  #pendingSeekMs: number | null = null;

  constructor(options: PlayerOptions = {}) {
    this.#audio = (options.createAudio ?? browserAudio)();
    this.#loadBlob =
      options.loadBlob ?? ((id) => getClip(id).then((record) => record?.blob));
    this.#createObjectUrl =
      options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.#revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));

    this.#audio.onplay = () => this.#update({ playing: true });
    this.#audio.onpause = () => this.#update({ playing: false });
    this.#audio.onended = () => this.#ended();
    this.#audio.ontimeupdate = () =>
      this.#update({ positionMs: Math.round(this.#audio.currentTime * 1000) });
    this.#audio.ondurationchange = () => this.#onDuration();
    this.#audio.onerror = () => this.#update({ status: 'error', playing: false });
  }

  get state(): PlayerState {
    return { ...this.#state, queue: [...this.#state.queue] };
  }

  /** Returns an unsubscribe function; views must call it when they go away. */
  subscribe(listener: (state: PlayerState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * The queue can change under the player: after a delete the removed clip must
   * not be reachable by next/previous.
   */
  setQueue(queue: readonly Clip[]): void {
    const next = [...queue];
    const currentId = this.#state.clip?.id;
    const index = currentId ? next.findIndex((clip) => clip.id === currentId) : -1;
    this.#update({ queue: next, index });
  }

  /** Starts a clip from the given playlist (FR-5.1). */
  async play(
    queue: readonly Clip[],
    clipId: string,
    options: { playlistRepeat?: number } = {},
  ): Promise<void> {
    const playlistRepeat = Math.max(1, Math.trunc(options.playlistRepeat ?? 1));
    this.setQueue(queue);
    const index = this.#state.queue.findIndex((clip) => clip.id === clipId);
    if (index < 0) return;
    this.#update({ playlistRepeat, playlistPass: 1 });
    await this.#load(index, { play: true, positionMs: 0 });
  }

  /** Loads a remembered clip without autoplaying it (FR-5.4). */
  async restore(
    queue: readonly Clip[],
    clipId: string,
    positionMs: number,
  ): Promise<void> {
    this.setQueue(queue);
    const index = this.#state.queue.findIndex((clip) => clip.id === clipId);
    if (index < 0) return;
    this.#update({ playlistRepeat: 1, playlistPass: 1 });
    await this.#load(index, { play: false, positionMs });
  }

  toggle(): void {
    if (this.#state.playing) this.pause();
    else this.playCurrent();
  }

  pause(): void {
    this.#audio.pause();
    this.#update({ playing: false });
  }

  playCurrent(): void {
    if (!this.#state.clip) return;
    // A finished clip would end again immediately; start it over instead.
    if (
      this.#state.durationMs > 0 &&
      this.#state.positionMs >= this.#state.durationMs - 250
    ) {
      this.#audio.currentTime = 0;
      this.#update({ positionMs: 0 });
    }
    void this.#audio.play().catch(() => this.#update({ playing: false }));
  }

  /** Manual next/previous wrap around the playlist and reset the repeat count. */
  next(): void {
    const { queue, index } = this.#state;
    if (queue.length === 0) return;
    const nextIndex = index < 0 ? 0 : (index + 1) % queue.length;
    void this.#load(nextIndex, { play: this.#state.playing, positionMs: 0 });
  }

  previous(): void {
    const { queue, index } = this.#state;
    if (queue.length === 0) return;
    const previousIndex = index < 0 ? 0 : (index - 1 + queue.length) % queue.length;
    void this.#load(previousIndex, { play: this.#state.playing, positionMs: 0 });
  }

  setRepeat(mode: RepeatMode): void {
    this.#update({ repeat: mode });
  }

  cycleRepeat(): RepeatMode {
    const mode = nextRepeatMode(this.#state.repeat);
    this.#update({ repeat: mode });
    return mode;
  }

  seek(ms: number): void {
    if (this.#audio) this.#audio.currentTime = ms / 1000;
  }

  async #load(
    index: number,
    options: { play: boolean; positionMs: number },
  ): Promise<void> {
    const clip = this.#state.queue[index];
    if (!clip) return;

    const token = ++this.#token;
    this.#pendingSeekMs = options.positionMs > 0 ? options.positionMs : null;
    this.#update({
      index,
      clip,
      status: 'loading',
      playing: false,
      positionMs: options.positionMs,
      durationMs: clip.durationMs,
      plays: 1,
    });

    const blob = await this.#loadBlob(clip.id);
    if (token !== this.#token) return;
    if (!blob) {
      this.#update({ status: 'error' });
      return;
    }

    this.#releaseUrl();
    this.#url = this.#createObjectUrl(blob);
    this.#audio.src = this.#url;

    try {
      if (options.play) await this.#audio.play();
      else this.#audio.pause();
    } catch {
      // A refused play (no gesture, no audio route) is not a broken clip.
      if (token === this.#token) this.#update({ playing: false });
    }
    // A tap on next while the blob was loading wins over this one.
    if (token !== this.#token) return;
    this.#update({ status: 'ready' });
  }

  #onDuration(): void {
    const duration = this.#audio.duration;
    const known = Number.isFinite(duration) && duration > 0;
    if (known) this.#update({ durationMs: Math.round(duration * 1000) });

    const seek = this.#pendingSeekMs;
    if (seek === null) return;
    this.#pendingSeekMs = null;
    // Resume past the end of a shorter clip lands at its start, not nowhere.
    const limit = known ? Math.round(duration * 1000) : seek;
    this.#audio.currentTime = Math.min(seek, limit) / 1000;
    this.#update({ positionMs: Math.round(this.#audio.currentTime * 1000) });
  }

  #ended(): void {
    const { repeat, index, queue, plays, playlistRepeat, playlistPass } = this.#state;

    if (repeat === 'one') {
      this.#restart();
      return;
    }

    if (typeof repeat === 'number' && plays < repeat) {
      this.#update({ plays: plays + 1 });
      this.#restart();
      return;
    }

    if (index + 1 < queue.length) {
      void this.#load(index + 1, { play: true, positionMs: 0 });
      return;
    }

    if (repeat === 'all') {
      void this.#load(0, { play: true, positionMs: 0 });
      return;
    }

    if (playlistRepeat > 1 && playlistPass < playlistRepeat) {
      this.#update({ playlistPass: playlistPass + 1 });
      void this.#load(0, { play: true, positionMs: 0 });
      return;
    }

    this.#update({ playing: false, positionMs: this.#state.durationMs, plays: 1 });
  }

  #restart(): void {
    this.#audio.currentTime = 0;
    this.#update({ positionMs: 0 });
    void this.#audio.play().catch(() => this.#update({ playing: false }));
  }

  #update(partial: Partial<PlayerState>): void {
    this.#state = { ...this.#state, ...partial };
    const snapshot = this.state;
    for (const listener of this.#listeners) listener(snapshot);
  }

  #releaseUrl(): void {
    if (this.#url) this.#revokeObjectUrl(this.#url);
    this.#url = null;
  }
}

let shared: Player | null = null;

/** The single player instance the views share (FR-5.5). */
export function sharedPlayer(): Player {
  shared ??= new Player();
  return shared;
}
