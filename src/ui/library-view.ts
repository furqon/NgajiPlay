import { loadQuran, surah } from '../data/quran';
import { sharedPlayer, type Player, type PlayerState } from '../playback/player';
import { downloadClip } from '../recording/export';
import { libraryHref, pageHref } from '../router';
import { deleteClip, getClip, getSetting, listClips, renameClip, setSetting } from '../store/db';
import { estimateStorage, isStoragePersisted, requestPersistence } from '../store/storage';
import { currentLanguage, fill, t } from '../strings';
import type { Clip, QuranData } from '../types';
import { el } from './dom';
import { formatDate, formatDuration, formatFileSize } from './format';

/** Entry point from the search screen and the page view. */
export function libraryLink(): HTMLElement {
  return el('a', {
    class: 'back library-link',
    attrs: { href: libraryHref(), 'data-testid': 'library-link' },
    text: t('libraryOpen'),
  });
}

/**
 * The library (FR-4.1): every clip in playlist order with its metadata, rename,
 * delete, export and the storage readout. Playlist order is derived by the store,
 * never stored (REQ §4).
 */
export async function renderLibrary(
  target: HTMLElement,
  isCurrent: () => boolean,
): Promise<void> {
  const back = el(
    'a',
    {
      class: 'back',
      attrs: { href: '#/', 'data-testid': 'back', 'aria-label': t('backToSearch') },
    },
    el('span', { attrs: { 'aria-hidden': 'true' }, text: '‹' }),
    el('span', { text: t('backToSearch') }),
  );
  const count = el('span', {
    class: 'library-count',
    attrs: { 'data-testid': 'library-count' },
  });
  const exportAll = el('button', {
    class: 'library-action',
    attrs: { type: 'button', 'data-testid': 'export-all', disabled: true },
  });
  const status = el('p', {
    class: 'state',
    attrs: { 'data-testid': 'library-state', 'aria-live': 'polite' },
  });
  const list = el('ol', { class: 'clip-list', attrs: { 'data-testid': 'clip-list' } });
  const storage = el('section', {
    class: 'storage',
    attrs: { 'data-testid': 'storage', 'aria-label': t('libraryOpen') },
  });
  const usage = el('p', { class: 'storage-line', attrs: { 'data-testid': 'storage-usage' } });
  const free = el('p', { class: 'storage-line', attrs: { 'data-testid': 'storage-free' } });
  const persistence = el('p', {
    class: 'storage-line storage-persist',
    attrs: { 'data-testid': 'storage-persist' },
  });
  storage.append(usage, free, persistence);

  target.replaceChildren(
    back,
    el('h2', { class: 'library-title', text: t('libraryTitle') }),
    el('p', { class: 'tagline', text: t('libraryTagline') }),
    storage,
    el('div', { class: 'library-bar' }, count, exportAll),
    status,
    list,
  );

  status.textContent = t('libraryLoading');

  const paintStorage = async (): Promise<void> => {
    const estimate = await estimateStorage();
    const persisted = await isStoragePersisted();
    if (!isCurrent()) return;

    if (estimate.quota > 0) {
      usage.textContent = fill(t('storageUsed'), {
        used: formatFileSize(estimate.usage),
        quota: formatFileSize(estimate.quota),
      });
      free.textContent = fill(t('storageFree'), { free: formatFileSize(estimate.available) });
    } else {
      usage.textContent = t('storageUnknown');
      free.textContent = '';
    }
    persistence.textContent = persisted ? t('storagePersistOn') : t('storagePersistOff');
  };

  // FR-4.6: ask once, then never nag again.
  const askPersistence = async (): Promise<void> => {
    if ((await isStoragePersisted()) || (await getSetting('persistenceRequested', false))) return;
    await requestPersistence();
    await setSetting('persistenceRequested', true);
    if (!isCurrent()) return;
    persistence.textContent = (await isStoragePersisted())
      ? t('storagePersistOn')
      : t('storagePersistOff');
  };

  let data: QuranData;
  let clips: Clip[];
  try {
    [data, clips] = await Promise.all([loadQuran(), listClips()]);
  } catch {
    if (isCurrent()) status.textContent = t('libraryLoadError');
    return;
  }
  if (!isCurrent()) return;

  status.textContent = '';
  void paintStorage();
  void askPersistence();

  const player = sharedPlayer();

  const refreshSummary = (): void => {
    const total = list.querySelectorAll('[data-testid="clip"]').length;
    count.textContent = fill(t('libraryCount'), { count: total });
    exportAll.textContent = fill(t('clipExportAll'), { count: total });
    (exportAll as HTMLButtonElement).disabled = total === 0;
    if (total === 0) list.append(emptyState());
  };

  for (const clip of clips) {
    list.append(clipRow(clip, data, status, refreshSummary, clips, player));
  }

  // The row being played reads as the now-playing bar's row, without another fetch.
  const paintNowPlaying = (state: PlayerState): void => {
    const activeId = state.clip?.id;
    for (const row of list.querySelectorAll<HTMLElement>('[data-clip-id]')) {
      const active = row.dataset.clipId === activeId;
      row.dataset.playing = String(active);
      const play = row.querySelector<HTMLButtonElement>('[data-testid="clip-play"]');
      if (play) {
        play.textContent = active && state.playing ? t('playerPause') : t('playerPlay');
      }
    }
  };

  const unsubscribe = player.subscribe((state) => {
    if (!isCurrent()) {
      // The view is gone; keeping the subscription would leak one per visit.
      unsubscribe();
      return;
    }
    paintNowPlaying(state);
  });
  paintNowPlaying(player.state);

  exportAll.addEventListener('click', () => {
    const current = clips.filter((clip) => list.querySelector(`[data-clip-id="${clip.id}"]`));
    void exportAllClips(current, status);
  });

  refreshSummary();
}

function emptyState(): HTMLElement {
  return el('li', {
    class: 'clip-empty',
    attrs: { 'data-testid': 'library-empty' },
    text: t('libraryEmpty'),
  });
}

function clipRow(
  clip: Clip,
  data: QuranData,
  status: HTMLElement,
  onRemoved: () => void,
  queue: Clip[],
  player: Player,
): HTMLElement {
  const name = el('span', {
    class: 'clip-name',
    attrs: { 'data-testid': 'clip-name', dir: 'auto' },
    text: clip.displayName,
  });
  const rowStatus = el('p', {
    class: 'clip-status',
    attrs: { 'data-testid': 'clip-status', 'aria-live': 'polite' },
  });
  const actions = el('div', { class: 'clip-actions' });
  const row = el(
    'li',
    {
      class: 'clip',
      attrs: { 'data-testid': 'clip', 'data-clip-id': clip.id, 'data-playing': 'false' },
    },
    el(
      'div',
      { class: 'clip-head' },
      name,
      el('a', {
        class: 'clip-meta',
        attrs: { href: pageHref(clip.page), 'data-testid': 'clip-meta' },
        text: fill(t('clipMeta'), {
          page: clip.page,
          surah: surah(data, clip.surah).nameId,
          from: clip.ayahStart,
          to: clip.ayahEnd,
        }),
      }),
      el('span', {
        class: 'clip-stats',
        attrs: { 'data-testid': 'clip-stats' },
        text: fill(t('clipStats'), {
          time: formatDuration(clip.durationMs),
          size: formatFileSize(clip.bytes),
          date: formatDate(clip.createdAt, currentLanguage()),
        }),
      }),
    ),
    rowStatus,
    actions,
  );

  const togglePlayback = (): void => {
    // Tapping the playing clip pauses it instead of starting it over (FR-5.1).
    if (player.state.clip?.id === clip.id) player.toggle();
    else void player.play(queue, clip.id);
  };

  const defaultActions = (): void => {
    const current = player.state;
    actions.replaceChildren(
      action(
        current.clip?.id === clip.id && current.playing ? t('playerPause') : t('playerPlay'),
        'clip-play',
        togglePlayback,
      ),
      action(t('clipRename'), 'clip-rename', () => startRename()),
      action(t('clipExport'), 'clip-export', () => void exportOne()),
      action(t('clipDelete'), 'clip-delete', () => confirmDelete(), 'danger'),
    );
  };

  const startRename = (): void => {
    rowStatus.textContent = '';
    const input = el('input', {
      class: 'clip-input',
      attrs: {
        type: 'text',
        value: clip.displayName,
        'aria-label': t('clipRenameLabel'),
        'data-testid': 'clip-input',
        autocomplete: 'off',
        dir: 'auto',
      },
    });
    const save = el('button', {
      class: 'clip-save',
      attrs: { type: 'submit', 'data-testid': 'clip-rename-save' },
      text: t('clipRenameSave'),
    });
    const cancel = el('button', {
      class: 'clip-cancel',
      attrs: { type: 'button', 'data-testid': 'clip-rename-cancel' },
      text: t('recordCancel'),
    });
    const form = el('form', { class: 'clip-rename' }, input, save, cancel);

    const restore = (): void => {
      form.replaceWith(name);
      defaultActions();
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value === '' || value === clip.displayName) {
        restore();
        return;
      }

      void renameClip(clip.id, value)
        .then((renamed) => {
          if (!renamed) throw new Error('clip missing');
          clip.displayName = renamed.displayName;
          name.textContent = renamed.displayName;
          restore();
          status.textContent = '';
        })
        .catch(() => {
          rowStatus.textContent = t('clipRenameFailed');
        });
    });

    cancel.addEventListener('click', restore);

    name.replaceWith(form);
    actions.replaceChildren();
    input.focus();
    input.select();
  };

  const confirmDelete = (): void => {
    rowStatus.textContent = t('clipDeleteConfirm');
    actions.replaceChildren(
      action(t('clipDelete'), 'clip-delete-confirm', () => void remove(), 'danger'),
      action(t('recordCancel'), 'clip-delete-cancel', () => {
        rowStatus.textContent = '';
        defaultActions();
      }),
    );
  };

  const remove = async (): Promise<void> => {
    try {
      await deleteClip(clip.id);
      row.remove();
      // A deleted clip must not be reachable with next/previous any more.
      const index = queue.indexOf(clip);
      if (index >= 0) queue.splice(index, 1);
      player.setQueue(queue);
      status.textContent = '';
      onRemoved();
    } catch {
      rowStatus.textContent = t('clipDeleteFailed');
    }
  };

  const exportOne = async (): Promise<void> => {
    try {
      const record = await getClip(clip.id);
      if (!record) {
        rowStatus.textContent = t('clipExportFailed');
        return;
      }
      downloadClip(record, record.blob);
      status.textContent = t('clipExported');
    } catch {
      rowStatus.textContent = t('clipExportFailed');
    }
  };

  defaultActions();
  return row;
}

/** One file per clip (FR-4.4); the gap keeps browsers from swallowing the rest. */
async function exportAllClips(clips: Clip[], status: HTMLElement): Promise<void> {
  try {
    for (const [index, clip] of clips.entries()) {
      status.textContent = fill(t('clipExporting'), { done: index + 1, total: clips.length });
      const record = await getClip(clip.id);
      if (!record) continue;
      downloadClip(record, record.blob);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    status.textContent = t('clipExported');
  } catch {
    status.textContent = t('clipExportFailed');
  }
}

function action(
  label: string,
  testId: string,
  onClick: () => void,
  variant: 'plain' | 'danger' = 'plain',
): HTMLButtonElement {
  const button = el('button', {
    class: variant === 'danger' ? 'clip-action clip-action-danger' : 'clip-action',
    attrs: { type: 'button', 'data-testid': testId },
    text: label,
  });
  button.addEventListener('click', onClick);
  return button;
}
