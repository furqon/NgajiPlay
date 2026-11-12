import {
  clampPlaylistRepeat,
  pageQueue,
  parsePageSelection,
} from '../playback/page-playlist';
import { sharedPlayer } from '../playback/player';
import { listClips } from '../store/db';
import { fill, t } from '../strings';
import { el } from './dom';

let lastPages = '';
let lastRepeat = '1';

export function pagePlaylist(): HTMLElement {
  const pages = el('input', {
    class: 'page-playlist-input',
    attrs: {
      type: 'text',
      inputmode: 'text',
      autocomplete: 'off',
      enterkeyhint: 'go',
      'aria-label': t('playlistPagesLabel'),
      placeholder: t('playlistPagesPlaceholder'),
      'data-testid': 'playlist-pages',
      value: lastPages,
    },
  });

  const repeat = el('input', {
    class: 'page-playlist-input page-playlist-repeat',
    attrs: {
      type: 'number',
      inputmode: 'numeric',
      min: 1,
      max: 99,
      step: 1,
      'aria-label': t('playlistRepeatLabel'),
      'data-testid': 'playlist-repeat',
      value: lastRepeat,
    },
  });

  const status = el('p', {
    class: 'page-playlist-status',
    attrs: { 'data-testid': 'playlist-status', 'aria-live': 'polite' },
  });

  const play = el('button', {
    class: 'page-playlist-play',
    attrs: { type: 'submit', 'data-testid': 'playlist-play' },
    text: t('playlistPlay'),
  });

  const form = el(
    'form',
    { class: 'page-playlist-form', attrs: { 'data-testid': 'playlist-form' } },
    el(
      'label',
      { class: 'page-playlist-field page-playlist-field-pages' },
      el('span', { text: t('playlistPagesLabel') }),
      pages,
    ),
    el(
      'label',
      { class: 'page-playlist-field page-playlist-field-repeat' },
      el('span', { text: t('playlistRepeatLabel') }),
      el(
        'span',
        { class: 'page-playlist-repeat-wrap' },
        repeat,
        el('span', { attrs: { 'aria-hidden': 'true' }, text: '×' }),
      ),
    ),
    play,
  );

  const section = el(
    'section',
    {
      class: 'page-playlist',
      attrs: { 'data-testid': 'page-playlist', 'aria-label': t('playlistTitle') },
    },
    el('h2', { class: 'page-playlist-title', text: t('playlistTitle') }),
    form,
    status,
  );

  pages.addEventListener('input', () => {
    lastPages = pages.value;
  });
  repeat.addEventListener('input', () => {
    lastRepeat = repeat.value;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    lastPages = pages.value;
    lastRepeat = repeat.value;

    const selection = parsePageSelection(pages.value);
    if (selection.pages.length === 0 || selection.invalid.length > 0) {
      status.textContent = t('playlistPagesError');
      return;
    }

    const times = clampPlaylistRepeat(Number(repeat.value));
    repeat.value = String(times);
    lastRepeat = repeat.value;
    status.textContent = t('loading');
    play.disabled = true;

    void listClips()
      .then((clips) => {
        const queue = pageQueue(clips, selection.pages);
        if (queue.length === 0) {
          status.textContent = fill(t('playlistEmpty'), {
            pages: selection.pages.join(', '),
          });
          return;
        }

        const player = sharedPlayer();
        player.setRepeat('off');
        void player.play(queue, queue[0]!.id, { playlistRepeat: times });
        status.textContent = fill(t('playlistPlaying'), {
          count: queue.length,
          pages: selection.pages.join(', '),
          repeat: times,
        });
      })
      .catch(() => {
        status.textContent = t('playlistLoadError');
      })
      .finally(() => {
        play.disabled = false;
      });
  });

  return section;
}
