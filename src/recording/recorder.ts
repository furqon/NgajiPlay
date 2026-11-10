import { pickMimeType } from './clip';

/** A finished capture, ready to preview and save (FR-2.3). */
export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** What the device really opened, not what was requested (REQ §8.3, trap 3). */
  channels: number;
}

export type MicDenialReason = 'denied' | 'missing' | 'unavailable';

export class MicPermissionError extends Error {
  constructor(readonly reason: MicDenialReason) {
    super(`Microphone unavailable: ${reason}`);
    this.name = 'MicPermissionError';
  }
}

export class UnsupportedCodecError extends Error {
  constructor() {
    super('This browser cannot record audio in a saveable format');
    this.name = 'UnsupportedCodecError';
  }
}

/** Ten minutes per clip, with a warning while there is still time to stop (FR-2.6). */
export const MAX_RECORDING_MS = 10 * 60_000;
export const CAP_WARNING_LEAD_MS = 60_000;
/** Mono at 96 kbps is a request, not a guarantee (REQ §4). */
export const AUDIO_BITS_PER_SECOND = 96_000;

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/** Only the parts of MediaRecorder this app relies on, so it can be faked. */
export interface RecorderLike {
  start(): void;
  stop(): void;
  readonly state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface RecorderOptions {
  isTypeSupported?: (type: string) => boolean;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createRecorder?: (
    stream: MediaStream,
    options: { mimeType: string; audioBitsPerSecond: number },
  ) => RecorderLike;
  now?: () => number;
  maxMs?: number;
  warningLeadMs?: number;
  /** Called once, `warningLeadMs` before the cap. */
  onWarning?: () => void;
  /** Called when the cap stopped the recording instead of the user. */
  onCap?: (recording: Recording) => void;
}

function microphoneError(error: unknown): Error {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return new MicPermissionError('denied');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return new MicPermissionError('missing');
  }
  return new MicPermissionError('unavailable');
}

/**
 * One recording at a time, bound to whatever the caller is showing. The stream
 * is released on every exit path — a forgotten track keeps the microphone
 * indicator on and drains the battery.
 */
export class Recorder {
  readonly #isTypeSupported: (type: string) => boolean;
  readonly #getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly #createRecorder: NonNullable<RecorderOptions['createRecorder']>;
  readonly #now: () => number;
  readonly #maxMs: number;
  readonly #warningLeadMs: number;
  readonly #onWarning?: () => void;
  readonly #onCap?: (recording: Recording) => void;

  #stream: MediaStream | undefined;
  #recorder: RecorderLike | undefined;
  #chunks: Blob[] = [];
  #mimeType = '';
  #channels = 1;
  #startedAt = 0;
  #timers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(options: RecorderOptions = {}) {
    this.#isTypeSupported =
      options.isTypeSupported ??
      ((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type));
    this.#getUserMedia =
      options.getUserMedia ??
      ((constraints) => {
        const devices = navigator.mediaDevices;
        if (!devices?.getUserMedia) {
          return Promise.reject(new MicPermissionError('unavailable'));
        }
        return devices.getUserMedia(constraints);
      });
    this.#createRecorder =
      options.createRecorder ??
      ((stream, recorderOptions) =>
        new MediaRecorder(stream, recorderOptions) as unknown as RecorderLike);
    this.#now = options.now ?? (() => Date.now());
    this.#maxMs = options.maxMs ?? MAX_RECORDING_MS;
    this.#warningLeadMs = options.warningLeadMs ?? CAP_WARNING_LEAD_MS;
    this.#onWarning = options.onWarning;
    this.#onCap = options.onCap;
  }

  /** Resolved once, so the UI can refuse before asking for the microphone. */
  get mimeType(): string | null {
    return pickMimeType(this.#isTypeSupported);
  }

  get recording(): boolean {
    return this.#recorder !== undefined;
  }

  elapsedMs(): number {
    return this.#recorder ? Math.max(0, Math.round(this.#now() - this.#startedAt)) : 0;
  }

  /** Asks for the microphone, then starts. Throws a typed error the UI can explain. */
  async start(): Promise<void> {
    if (this.#recorder) throw new Error('a recording is already in progress');

    const mimeType = this.mimeType;
    if (!mimeType) throw new UnsupportedCodecError();

    let stream: MediaStream;
    try {
      stream = await this.#getUserMedia({ audio: AUDIO_CONSTRAINTS });
    } catch (error) {
      throw error instanceof MicPermissionError ? error : microphoneError(error);
    }

    let recorder: RecorderLike;
    try {
      recorder = this.#createRecorder(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      throw new UnsupportedCodecError();
    }

    this.#stream = stream;
    this.#recorder = recorder;
    this.#chunks = [];
    this.#mimeType = mimeType;
    this.#channels = stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.#chunks.push(event.data);
    };
    recorder.start();
    this.#startedAt = this.#now();

    this.#timers.push(
      setTimeout(() => this.#onWarning?.(), Math.max(0, this.#maxMs - this.#warningLeadMs)),
    );
    this.#timers.push(setTimeout(() => this.#cap(), this.#maxMs));
  }

  /** Stops and hands back the audio. Safe to await from a click handler. */
  stop(): Promise<Recording> {
    const recorder = this.#recorder;
    if (!recorder) return Promise.reject(new Error('nothing is recording'));

    this.#clearTimers();
    const durationMs = this.elapsedMs();
    const mimeType = this.#mimeType;
    const channels = this.#channels;

    return new Promise<Recording>((resolve, reject) => {
      const fail = () => {
        this.#release();
        reject(new Error('MediaRecorder failed while stopping'));
      };

      recorder.onerror = fail;
      recorder.onstop = () => {
        const blob = new Blob(this.#chunks, { type: mimeType });
        this.#release();
        resolve({ blob, mimeType, durationMs, channels });
      };

      try {
        recorder.stop();
      } catch {
        fail();
      }
    });
  }

  /** Throws the capture away and releases the microphone (FR-2.3). */
  cancel(): void {
    this.#clearTimers();
    const recorder = this.#recorder;
    this.#recorder = undefined;
    this.#chunks = [];

    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // Already inactive; nothing to stop.
      }
    }

    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = undefined;
  }

  #cap(): void {
    if (!this.#recorder) return;
    void this.stop().then(
      (recording) => this.#onCap?.(recording),
      () => undefined,
    );
  }

  #release(): void {
    this.#clearTimers();
    this.#recorder = undefined;
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = undefined;
  }

  #clearTimers(): void {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers = [];
  }
}
