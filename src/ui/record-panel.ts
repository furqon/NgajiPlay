import { surah } from '../data/quran';
import { defaultClipName, extensionFor } from '../recording/clip';
import {
  MicPermissionError,
  Recorder,
  UnsupportedCodecError,
  type Recording,
} from '../recording/recorder';
import { clipId, getClip, putClip } from '../store/db';
import { StorageQuotaError, ensureSpace, estimateStorage } from '../store/storage';
import { fill, t } from '../strings';
import type { Clip, PageSlice, QuranData } from '../types';
import { el } from './dom';
import { formatDuration, formatKilobytes } from './format';

export interface RecorderView {
  /** The element the panel is inserted into. */
  host: HTMLElement;
  /** The panel goes immediately before this element (the slice list). */
  mount: HTMLElement;
  data: QuranData;
  page: number;
  slice: PageSlice;
  onSaved: (clip: Clip) => void;
}

const MB = 1_048_576;

/** The open panel, so a route change can close it and release the microphone. */
let closeActive: (() => void) | null = null;

export function closeRecorder(): void {
  closeActive?.();
}

/** A language switch must not discard a capture that is still in the panel. */
export function isRecorderOpen(): boolean {
  return closeActive !== null;
}

function megabytes(bytes: number): string {
  return (bytes / MB).toFixed(1);
}

/**
 * The recorder for one slice (FR-2.2). It owns the panel's whole lifecycle:
 * capture, preview, replace confirmation, quota refusal and cleanup, so the
 * page view only has to hand it a slice and react to a save.
 */
export function openRecorder(view: RecorderView): void {
  closeRecorder();

  const name = surah(view.data, view.slice.surah).nameId;
  const { page, slice } = view;

  const status = el('p', {
    class: 'recorder-status',
    attrs: { 'data-testid': 'recorder-status', 'aria-live': 'polite' },
  });
  const timer = el('p', {
    class: 'recorder-timer',
    attrs: { 'data-testid': 'record-timer', 'aria-label': t('recordTimer') },
    text: '0:00',
  });
  timer.hidden = true;

  const warning = el('p', {
    class: 'recorder-warning',
    attrs: { 'data-testid': 'record-warning' },
  });
  warning.hidden = true;

  const error = el('p', {
    class: 'recorder-error',
    attrs: { 'data-testid': 'record-error', role: 'alert' },
  });
  error.hidden = true;

  const body = el('div', { class: 'recorder-body', attrs: { 'data-testid': 'record-body' } });
  const actions = el('div', { class: 'recorder-actions', attrs: { 'data-testid': 'record-actions' } });

  const panel = el(
    'section',
    {
      class: 'recorder',
      attrs: { 'data-testid': 'recorder', 'aria-label': t('recorderLabel') },
    },
    el('h2', {
      class: 'recorder-title',
      attrs: { 'data-testid': 'recorder-title' },
      text: fill(t('recorderTitle'), {
        surah: name,
        from: slice.ayahStart,
        to: slice.ayahEnd,
      }),
    }),
    // No second copy of the slice: the page above already shows these ayahs,
    // so the panel spends its height on the timer and the controls only.
    timer,
    status,
    warning,
    error,
    body,
    actions,
  );

  let recording: Recording | null = null;
  let previewUrl: string | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  let replaceConfirmed = false;

  const recorder = new Recorder({
    onWarning: () => {
      warning.textContent = t('recorderCapWarning');
      warning.hidden = false;
    },
    onCap: (finished) => {
      warning.textContent = t('recorderCapReached');
      warning.hidden = false;
      finish(finished);
    },
  });

  function action(
    label: string,
    testId: string,
    variant: 'primary' | 'ghost',
    onClick: () => void,
  ): HTMLButtonElement {
    const node = el('button', {
      class: `recorder-action recorder-action-${variant}`,
      attrs: { type: 'button', 'data-testid': testId },
      text: label,
    });
    node.addEventListener('click', onClick);
    return node;
  }

  function paintIntro(message: string = t('recorderReady')): void {
    stopTicker();
    timer.hidden = true;
    status.textContent = message;
    actions.replaceChildren(
      action(t('recordStart'), 'record-start', 'primary', () => void begin()),
      action(t('recordClose'), 'record-close', 'ghost', close),
    );
    actions.querySelector('button')?.focus({ preventScroll: true });
  }

  function paintPreviewActions(): void {
    actions.replaceChildren(
      action(t('recordSave'), 'record-save', 'primary', () => void save()),
      action(t('recordRetake'), 'record-retake', 'ghost', () => void begin()),
      action(t('recordDiscard'), 'record-discard', 'ghost', close),
    );
  }

  function startTicker(): void {
    timer.textContent = formatDuration(recorder.elapsedMs());
    stopTicker();
    ticker = setInterval(() => {
      timer.textContent = formatDuration(recorder.elapsedMs());
    }, 200);
  }

  function stopTicker(): void {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  function hideError(): void {
    error.textContent = '';
    error.hidden = true;
  }

  function clearPreview(): void {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    recording = null;
    body.replaceChildren();
  }

  function finish(finished: Recording): void {
    stopTicker();
    timer.hidden = true;
    clearPreview();
    recording = finished;
    previewUrl = URL.createObjectURL(finished.blob);

    body.replaceChildren(
      el('audio', {
        class: 'recorder-audio',
        attrs: {
          controls: true,
          src: previewUrl,
          'data-testid': 'record-preview',
          'aria-label': t('recordPreview'),
        },
      }),
      el('p', {
        class: 'recorder-meta',
        attrs: { 'data-testid': 'record-meta' },
        text: fill(t('recordMeta'), {
          time: formatDuration(finished.durationMs),
          size: formatKilobytes(finished.blob.size),
        }),
      }),
    );
    status.textContent = t('recorderPreview');
    paintPreviewActions();
  }

  async function begin(): Promise<void> {
    if (busy) return;
    busy = true;
    hideError();
    warning.hidden = true;
    clearPreview();
    status.textContent = t('recorderPreparing');
    actions.replaceChildren();

    try {
      await recorder.start();
      busy = false;
      status.textContent = t('recorderRecording');
      timer.hidden = false;
      startTicker();
      actions.replaceChildren(
        action(t('recordStop'), 'record-stop', 'primary', () => void stop()),
        action(t('recordDiscard'), 'record-discard', 'ghost', close),
      );
    } catch (caught) {
      busy = false;
      showError(describeStartError(caught));
      // A missing or unsupported codec will not fix itself on retry.
      const retry = caught instanceof UnsupportedCodecError ? [] : [action(t('recordRetry'), 'record-retry', 'primary', () => void begin())];
      actions.replaceChildren(...retry, action(t('recordClose'), 'record-close', 'ghost', close));
    }
  }

  async function stop(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const finished = await recorder.stop();
      busy = false;
      finish(finished);
    } catch {
      busy = false;
      showError(t('recordFailed'));
      paintIntro();
    }
  }

  function buildClip(finished: Recording): Clip {
    const now = Date.now();
    return {
      id: clipId(page, slice.surah),
      page,
      surah: slice.surah,
      ayahStart: slice.ayahStart,
      ayahEnd: slice.ayahEnd,
      mimeType: finished.mimeType,
      bytes: finished.blob.size,
      durationMs: finished.durationMs,
      createdAt: now,
      updatedAt: now,
      displayName: defaultClipName({
        page,
        surah: slice.surah,
        ayahStart: slice.ayahStart,
        ayahEnd: slice.ayahEnd,
        surahName: name,
        extension: extensionFor(finished.mimeType),
      }),
      channels: finished.channels,
    };
  }

  async function save(): Promise<void> {
    if (busy || !recording) return;
    const finished = recording;
    busy = true;
    hideError();

    try {
      // FR-2.8: refuse before writing rather than failing halfway.
      await ensureSpace(finished.blob.size);

      if (!replaceConfirmed && (await getClip(clipId(page, slice.surah)))) {
        busy = false;
        status.textContent = t('recordConfirmReplace');
        actions.replaceChildren(
          action(t('recordReplace'), 'record-replace', 'primary', () => {
            replaceConfirmed = true;
            void save();
          }),
          action(t('recordCancel'), 'record-cancel-replace', 'ghost', () => {
            replaceConfirmed = false;
            status.textContent = t('recorderPreview');
            paintPreviewActions();
          }),
        );
        actions.querySelector('button')?.focus({ preventScroll: true });
        return;
      }

      status.textContent = t('recorderSaving');
      actions.replaceChildren();

      const clip = buildClip(finished);
      await putClip(clip, finished.blob);
      busy = false;
      view.onSaved(clip);
      status.textContent = t('recorderSaved');
      warning.hidden = true;
      actions.replaceChildren(
        action(t('recordRetake'), 'record-retake', 'ghost', () => void begin()),
        action(t('recordClose'), 'record-close', 'primary', close),
      );
      actions.querySelector('button')?.focus({ preventScroll: true });
    } catch (caught) {
      busy = false;
      const available = (await estimateStorage()).available;
      showError(
        caught instanceof StorageQuotaError
          ? fill(t('recordQuota'), {
              need: megabytes(finished.blob.size),
              free: megabytes(available),
            })
          : t('recordFailed'),
      );
      paintPreviewActions();
    }
  }

  function close(): void {
    recorder.cancel();
    stopTicker();
    clearPreview();
    panel.remove();
    if (closeActive === close) closeActive = null;
  }

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  closeActive = close;
  paintIntro();
  view.host.insertBefore(panel, view.mount);
  panel.scrollIntoView({ block: 'start' });
}

function describeStartError(caught: unknown): string {
  if (caught instanceof UnsupportedCodecError) return t('recordUnsupported');
  if (caught instanceof MicPermissionError) {
    if (caught.reason === 'denied') return t('recordDenied');
    if (caught.reason === 'missing') return t('recordNoMic');
  }
  return t('recordFailed');
}
