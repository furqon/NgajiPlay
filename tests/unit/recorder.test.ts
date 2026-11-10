import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MicPermissionError,
  Recorder,
  UnsupportedCodecError,
  type RecorderLike,
} from '../../src/recording/recorder';

class FakeMediaRecorder implements RecorderLike {
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(
    readonly stream: MediaStream,
    readonly options: { mimeType: string; audioBitsPerSecond: number },
  ) {}

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    if (this.state === 'inactive') throw new DOMException('inactive', 'InvalidStateError');
    this.state = 'inactive';
    this.ondataavailable?.({
      data: new Blob(['x'.repeat(64)], { type: this.options.mimeType }),
    });
    this.onstop?.();
  }
}

function fakeAudio(settings: MediaTrackSettings = { channelCount: 2 }) {
  const stop = vi.fn();
  const track = { stop, getSettings: () => settings };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;

  return { stream, stop };
}

function permissionError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Recorder', () => {
  it('refuses unsupported browsers before asking for the microphone', async () => {
    const getUserMedia = vi.fn();
    const recorder = new Recorder({ isTypeSupported: () => false, getUserMedia });

    await expect(recorder.start()).rejects.toBeInstanceOf(UnsupportedCodecError);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('requests mono without processing and stops the stream after saving', async () => {
    const audio = fakeAudio();
    let constraints: MediaStreamConstraints | undefined;
    let created: FakeMediaRecorder | undefined;

    const recorder = new Recorder({
      isTypeSupported: (type) => type === 'audio/webm;codecs=opus',
      getUserMedia: (value) => {
        constraints = value;
        return Promise.resolve(audio.stream);
      },
      createRecorder: (stream, options) => (created = new FakeMediaRecorder(stream, options)),
    });

    await recorder.start();
    expect(recorder.recording).toBe(true);
    expect(constraints?.audio).toEqual({
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
    expect(created?.options).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 96_000,
    });

    const recording = await recorder.stop();
    expect(recording.mimeType).toBe('audio/webm;codecs=opus');
    expect(recording.blob.type).toBe('audio/webm;codecs=opus');
    expect(recording.blob.size).toBeGreaterThan(0);
    // The device opened stereo even though mono was requested (REQ §8.3).
    expect(recording.channels).toBe(2);
    expect(audio.stop).toHaveBeenCalled();
    expect(recorder.recording).toBe(false);
  });

  it('maps permission failures to reasons the UI can explain', async () => {
    const reject = (name: string) =>
      new Recorder({
        isTypeSupported: () => true,
        getUserMedia: () => Promise.reject(permissionError(name)),
      });

    await expect(reject('NotAllowedError').start()).rejects.toMatchObject({
      name: 'MicPermissionError',
      reason: 'denied',
    });
    await expect(reject('NotFoundError').start()).rejects.toMatchObject({ reason: 'missing' });
    await expect(reject('NotReadableError').start()).rejects.toMatchObject({
      reason: 'unavailable',
    });
    await expect(
      new Recorder({
        isTypeSupported: () => true,
        getUserMedia: () => Promise.reject(new MicPermissionError('denied')),
      }).start(),
    ).rejects.toBeInstanceOf(MicPermissionError);
  });

  it('discards a capture and releases the microphone', async () => {
    const audio = fakeAudio();
    const recorder = new Recorder({
      isTypeSupported: () => true,
      getUserMedia: () => Promise.resolve(audio.stream),
      createRecorder: (stream, options) => new FakeMediaRecorder(stream, options),
    });

    await recorder.start();
    recorder.cancel();

    expect(recorder.recording).toBe(false);
    expect(audio.stop).toHaveBeenCalled();
  });

  it('warns before the cap and stops itself at ten minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const audio = fakeAudio({ channelCount: 1 });
    const onWarning = vi.fn();
    const onCap = vi.fn();
    const recorder = new Recorder({
      isTypeSupported: () => true,
      getUserMedia: () => Promise.resolve(audio.stream),
      createRecorder: (stream, options) => new FakeMediaRecorder(stream, options),
      maxMs: 1_000,
      warningLeadMs: 400,
      onWarning,
      onCap,
    });

    await recorder.start();

    await vi.advanceTimersByTimeAsync(599);
    expect(onWarning).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onWarning).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(400);
    expect(onCap).toHaveBeenCalledTimes(1);
    expect(onCap.mock.calls[0]?.[0]).toMatchObject({ durationMs: 1_000 });
    expect(recorder.recording).toBe(false);
    expect(audio.stop).toHaveBeenCalled();
  });
});
