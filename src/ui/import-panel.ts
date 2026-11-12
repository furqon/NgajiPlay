import { surah } from '../data/quran';
import {
  IMPORT_ACCEPT,
  defaultImportAction,
  readImportFiles,
  type ImportEntry,
  type ImportProblem,
} from '../recording/import';
import { getClip, putClip } from '../store/db';
import { ensureSpace } from '../store/storage';
import { currentLanguage, fill, t } from '../strings';
import type { Clip, QuranData } from '../types';
import { el } from './dom';
import { formatDate, formatDuration, formatFileSize } from './format';

export interface ImportPanelOptions {
  data: QuranData;
  clips: () => readonly Clip[];
  status: HTMLElement;
  onImported: () => Promise<void>;
}

export interface ImportPanel {
  button: HTMLButtonElement;
  input: HTMLInputElement;
  panel: HTMLElement;
  showFiles: (files: File[]) => Promise<boolean>;
}

type Decision = 'import' | 'replace' | 'keep';
type Outcome = 'imported' | 'replaced' | 'skipped' | 'failed';

const PROBLEM_KEY: Record<ImportProblem, 'importUnrecognised' | 'importUnsupported' | 'importNotOnPage' | 'importCorrupt' | 'importDuplicate'> = {
  unrecognised: 'importUnrecognised',
  unsupported: 'importUnsupported',
  'not-on-page': 'importNotOnPage',
  corrupt: 'importCorrupt',
  duplicate: 'importDuplicate',
};

const OUTCOME_KEY: Record<Outcome, 'importImported' | 'importReplaced' | 'importSkipped' | 'importFailed'> = {
  imported: 'importImported',
  replaced: 'importReplaced',
  skipped: 'importSkipped',
  failed: 'importFailed',
};

export function createImportPanel(options: ImportPanelOptions): ImportPanel {
  const button = el('button', {
    class: 'library-action',
    attrs: { type: 'button', 'data-testid': 'import-clips' },
    text: t('clipImport'),
  });
  const input = el('input', {
    attrs: {
      type: 'file',
      multiple: true,
      accept: IMPORT_ACCEPT,
      hidden: true,
      'data-testid': 'import-input',
    },
  });
  const panel = el('section', {
    class: 'import-panel',
    attrs: { 'data-testid': 'import-panel', hidden: true, 'aria-label': t('clipImportTitle') },
  });

  let entries: ImportEntry[] = [];
  let decisions = new Map<number, Decision>();
  let busy = false;

  button.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    void analyse(files);
  });

  async function analyse(files: File[]): Promise<boolean> {
    if (busy) return false;
    busy = true;
    button.disabled = true;
    panel.hidden = true;
    options.status.textContent = fill(t('importReading'), { count: files.length });

    try {
      entries = await readImportFiles(files, options.data);
      const existing = new Map(options.clips().map((clip) => [clip.id, clip]));
      decisions = new Map();

      for (const [index, entry] of entries.entries()) {
        if (entry.kind !== 'candidate') continue;
        const current = existing.get(entry.clip.id);
        decisions.set(index, defaultImportAction(current, entry.clip));
      }

      paintPreview(existing);
      options.status.textContent = entries.some((entry) => entry.kind === 'candidate')
        ? ''
        : t('importNothing');
    } catch {
      options.status.textContent = t('importReadFailed');
      panel.hidden = true;
    } finally {
      busy = false;
      button.disabled = false;
    }
    return true;
  }

  function paintPreview(existing: Map<string, Clip>): void {
    panel.replaceChildren();
    panel.hidden = false;

    const list = el('ol', { class: 'import-list' });
    for (const [index, entry] of entries.entries()) {
      list.append(row(index, entry, existing));
    }

    const conflicts = entries.some(
      (entry, index) => entry.kind === 'candidate' && decisions.get(index) !== 'import',
    );
    const replaceAll = el('button', {
      class: 'import-action',
      attrs: { type: 'button', 'data-testid': 'import-replace-all' },
      text: t('importReplaceAll'),
    });
    replaceAll.hidden = !conflicts;
    replaceAll.addEventListener('click', () => {
      for (const [index, entry] of entries.entries()) {
        if (entry.kind !== 'candidate') continue;
        if (existing.has(entry.clip.id)) decisions.set(index, 'replace');
      }
      paintPreview(existing);
    });

    const apply = el('button', {
      class: 'import-action import-action-primary',
      attrs: {
        type: 'button',
        'data-testid': 'import-apply',
        disabled: !entries.some((entry) => entry.kind === 'candidate'),
      },
      text: t('importApply'),
    });
    apply.addEventListener('click', () => void applyImport());

    const cancel = el('button', {
      class: 'import-action',
      attrs: { type: 'button', 'data-testid': 'import-cancel' },
      text: t('importCancel'),
    });
    cancel.addEventListener('click', reset);

    panel.append(
      el('h3', { class: 'import-title', text: t('clipImportTitle') }),
      el('p', { class: 'import-hint', text: t('clipImportHint') }),
      list,
      el('div', { class: 'import-actions' }, replaceAll, apply, cancel),
    );
  }

  function row(index: number, entry: ImportEntry, existing: Map<string, Clip>): HTMLElement {
    const title = el('span', {
      class: 'import-name',
      attrs: { 'data-testid': 'import-row-name', dir: 'auto' },
      text: label(entry),
    });
    const meta = el('span', {
      class: 'import-meta',
      attrs: { 'data-testid': 'import-row-meta' },
      text: describe(entry),
    });
    const outcome = el('span', {
      class: 'import-outcome',
      attrs: { 'data-testid': 'import-outcome', 'aria-live': 'polite' },
    });
    const children: HTMLElement[] = [title, meta];

    if (entry.kind === 'candidate') {
      const current = existing.get(entry.clip.id);
      if (current) {
        const decision = decisions.get(index) ?? 'keep';
        const keep = decisionButton(index, 'keep', t('importKeep'), decision === 'keep');
        const replace = decisionButton(index, 'replace', t('importReplace'), decision === 'replace');
        children.push(
          el('p', {
            class: 'import-existing',
            attrs: { 'data-testid': 'import-row-existing' },
            text: fill(t('importExisting'), {
              name: current.displayName,
              date: formatDate(current.updatedAt, currentLanguage()),
            }),
          }),
          el('div', { class: 'import-choice' }, keep, replace),
        );
      } else {
        children.push(
          el('span', { class: 'import-badge', attrs: { 'data-testid': 'import-row-new' }, text: t('importNew') }),
        );
      }
    } else {
      children.push(
        el('span', {
          class: 'import-problem',
          attrs: { 'data-testid': 'import-row-problem' },
          text: t(PROBLEM_KEY[entry.problem]),
        }),
      );
    }

    children.push(outcome);
    return el(
      'li',
      {
        class: 'import-row',
        attrs: {
          'data-testid': 'import-row',
          'data-import-index': index,
          'data-kind': entry.kind,
          'data-action': entry.kind === 'candidate' ? decisions.get(index) ?? 'keep' : '',
        },
      },
      el('div', { class: 'import-head' }, title, meta),
      ...children,
    );
  }

  function decisionButton(
    index: number,
    decision: Decision,
    labelText: string,
    selected: boolean,
  ): HTMLButtonElement {
    const node = el('button', {
      class: 'import-choice-button',
      attrs: {
        type: 'button',
        'data-testid': `import-${decision}`,
        'aria-pressed': selected ? 'true' : 'false',
      },
      text: labelText,
    });
    node.addEventListener('click', () => {
      decisions.set(index, decision);
      const rowEntry = entries[index];
      if (!rowEntry || rowEntry.kind !== 'candidate') return;
      const current = new Map(options.clips().map((clip) => [clip.id, clip]));
      paintPreview(current);
    });
    return node;
  }

  async function applyImport(): Promise<void> {
    if (busy) return;
    busy = true;
    for (const node of panel.querySelectorAll<HTMLButtonElement>('button')) {
      node.disabled = true;
    }
    options.status.textContent = t('importApplying');

    let imported = 0;
    let replaced = 0;
    let skipped = 0;
    let failed = 0;

    for (const [index, entry] of entries.entries()) {
      if (entry.kind === 'rejected') {
        if (entry.problem === 'duplicate') {
          skipped += 1;
          paintOutcome(index, 'skipped');
        } else {
          failed += 1;
          paintOutcome(index, 'failed');
        }
        continue;
      }

      const decision = decisions.get(index) ?? 'import';
      try {
        if (decision === 'keep') {
          skipped += 1;
          paintOutcome(index, 'skipped');
          continue;
        }

        const current = await getClip(entry.clip.id);
        const write =
          decision === 'replace' ||
          (decision === 'import' &&
            (!current || entry.clip.updatedAt > current.updatedAt));
        if (!write) {
          skipped += 1;
          paintOutcome(index, 'skipped');
          continue;
        }

        await ensureSpace(entry.file.size);
        await putClip(entry.clip, entry.file);
        if (current) {
          replaced += 1;
          paintOutcome(index, 'replaced');
        } else {
          imported += 1;
          paintOutcome(index, 'imported');
        }
      } catch {
        failed += 1;
        paintOutcome(index, 'failed');
      }
    }

    try {
      await options.onImported().catch(() => undefined);
    } finally {
      const cancel = panel.querySelector<HTMLButtonElement>('[data-testid="import-cancel"]');
      if (cancel) {
        cancel.textContent = t('importClose');
        cancel.disabled = false;
      }
      options.status.textContent = fill(t('importSummary'), {
        imported,
        replaced,
        skipped,
        failed,
      });
      busy = false;
      button.disabled = false;
    }
  }

  function paintOutcome(index: number, outcome: Outcome): void {
    const rowNode = panel.querySelector<HTMLElement>(`[data-import-index="${index}"]`);
    if (!rowNode) return;
    rowNode.dataset.outcome = outcome;
    const marker = rowNode.querySelector<HTMLElement>('[data-testid="import-outcome"]');
    if (marker) marker.textContent = t(OUTCOME_KEY[outcome]);
  }

  function reset(): void {
    if (busy) return;
    entries = [];
    decisions = new Map();
    panel.hidden = true;
    panel.replaceChildren();
    options.status.textContent = '';
    button.disabled = false;
  }

  function label(entry: ImportEntry): string {
    const page = entry.kind === 'candidate' ? entry.clip.page : entry.page;
    const surahNumber = entry.kind === 'candidate' ? entry.clip.surah : entry.surah;
    if (page === undefined || surahNumber === undefined) return entry.file.name;
    return fill(t('importRowMeta'), { page, surah: surahLabel(surahNumber) });
  }

  function surahLabel(number: number): string {
    try {
      return surah(options.data, number).nameId;
    } catch {
      return `Surah ${number}`;
    }
  }

  function describe(entry: ImportEntry): string {
    const date = formatDate(entry.file.lastModified, currentLanguage());
    if (entry.kind === 'rejected') {
      return `${entry.file.name} · ${date}`;
    }
    return fill(t('importIncoming'), {
      name: entry.file.name,
      time: formatDuration(entry.clip.durationMs),
      size: formatFileSize(entry.clip.bytes),
      date,
    });
  }

  return { button, input, panel, showFiles: analyse };
}
