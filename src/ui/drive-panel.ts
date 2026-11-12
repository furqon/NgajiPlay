import {
  disconnectDrive,
  onBackupChange,
  processBackupQueue,
  queueBackup,
  restoreDriveFiles,
} from '../drive/backup';
import { readGoogleClientId } from '../drive/config';
import { DriveAuthError, DriveConfigError, DriveNetworkError } from '../drive/errors';
import {
  clearGoogleDriveSession,
  connectGoogleDrive,
  googleDriveSession,
} from '../drive/oauth';
import { resetDriveCache } from '../drive/client';
import { listBackups } from '../store/db';
import { fill, t } from '../strings';
import type { Clip } from '../types';
import { el } from './dom';

export interface DrivePanelOptions {
  clips: () => readonly Clip[];
  isCurrent: () => boolean;
  importFiles: (files: File[]) => Promise<boolean>;
  onLibraryChanged: () => void;
}

export interface DrivePanel {
  element: HTMLElement;
  refresh: () => void;
}

export function createDrivePanel(options: DrivePanelOptions): DrivePanel {
  const panel = el('section', {
    class: 'drive',
    attrs: { 'data-testid': 'drive', 'aria-label': t('driveTitle') },
  });
  const title = el('h3', { class: 'drive-title', text: t('driveTitle') });
  const body = el('div', { class: 'drive-body' });
  panel.append(title, body);

  let clientId = '';
  let loaded = false;
  let busy = false;
  let message = '';

  function paint(): void {
    if (!options.isCurrent()) return;
    body.replaceChildren();

    if (!loaded) {
      body.append(el('p', { class: 'drive-status', text: t('driveLoading') }));
      return;
    }

    body.append(el('p', { class: 'drive-hint', text: t('driveOffDefault') }));

    if (clientId === '') {
      body.append(
        el('p', { class: 'drive-status', text: t('driveNeedsClient') }),
        el('a', {
          class: 'storage-link',
          attrs: { href: '#/settings', 'data-testid': 'drive-open-settings' },
          text: t('driveOpenSettings'),
        }),
      );
      return;
    }

    const session = googleDriveSession();
    if (!session) {
      body.append(connectButton());
    } else {
      body.append(
        el('p', {
          class: 'drive-status',
          attrs: { 'data-testid': 'drive-connected', 'data-scope': session.scope },
          text: fill(t('driveConnectedAs'), { email: session.email }),
        }),
        el('p', {
          class: 'drive-hint',
          attrs: { 'data-testid': 'drive-scope' },
          text: t('driveScope'),
        }),
        actionRow(),
      );

      if (!navigator.onLine) {
        body.append(
          el('p', {
            class: 'drive-status',
            attrs: { 'data-testid': 'drive-offline' },
            text: t('driveOffline'),
          }),
        );
      }
    }

    if (message) {
      body.append(
        el('p', {
          class: 'drive-status',
          attrs: { 'data-testid': 'drive-status', 'aria-live': 'polite' },
          text: message,
        }),
      );
    }
  }

  function connectButton(): HTMLElement {
    const button = el('button', {
      class: 'library-action',
      attrs: {
        type: 'button',
        'data-testid': 'drive-connect',
        disabled: busy || !navigator.onLine,
      },
      text: t('driveConnect'),
    });
    button.addEventListener('click', () => void connect());
    const children: HTMLElement[] = [button];
    if (!navigator.onLine) {
      children.push(el('p', { class: 'drive-status', text: t('driveOffline') }));
    }
    return el('div', { class: 'drive-actions' }, ...children);
  }

  function actionRow(): HTMLElement {
    const count = options.clips().length;
    const backupButton = el('button', {
      class: 'library-action',
      attrs: {
        type: 'button',
        'data-testid': 'drive-backup-all',
        disabled: busy || count === 0,
      },
      text: fill(t('driveBackupAll'), { count }),
    });
    const restoreButton = el('button', {
      class: 'library-action',
      attrs: {
        type: 'button',
        'data-testid': 'drive-restore',
        disabled: busy || !navigator.onLine,
      },
      text: t('driveRestore'),
    });
    const disconnectButton = el('button', {
      class: 'storage-link',
      attrs: { type: 'button', 'data-testid': 'drive-disconnect', disabled: busy },
      text: t('driveDisconnect'),
    });

    backupButton.addEventListener('click', () => void backupAll());
    restoreButton.addEventListener('click', () => void restore());
    disconnectButton.addEventListener('click', () => void disconnect());

    return el(
      'div',
      { class: 'drive-actions' },
      backupButton,
      restoreButton,
      disconnectButton,
    );
  }

  async function connect(): Promise<void> {
    busy = true;
    message = t('driveConnecting');
    paint();
    try {
      await connectGoogleDrive(clientId);
      resetDriveCache();
      message = '';
      await processBackupQueue();
    } catch (error) {
      message = failureMessage(error, t('driveConnectFailed'));
    } finally {
      busy = false;
      paint();
      options.onLibraryChanged();
    }
  }

  async function disconnect(): Promise<void> {
    busy = true;
    message = t('driveDisconnecting');
    paint();
    try {
      await disconnectDrive();
      message = t('driveDisconnected');
    } catch {
      message = t('driveDisconnectFailed');
    } finally {
      busy = false;
      paint();
      options.onLibraryChanged();
    }
  }

  async function backupAll(): Promise<void> {
    busy = true;
    message = t('driveBackingUp');
    paint();
    try {
      const ids = new Set(options.clips().map((clip) => clip.id));
      await queueBackup([...ids]);
      const records = (await listBackups()).filter((record) => ids.has(record.id));
      const uploaded = records.filter((record) => record.state === 'uploaded').length;
      const failed = records.filter((record) => record.state === 'failed').length;
      const pending = records.filter((record) => record.state === 'pending').length;
      message = fill(t('driveBackupSummary'), { uploaded, failed, pending });
    } catch (error) {
      message = failureMessage(error, t('driveBackupFailed'));
    } finally {
      busy = false;
      paint();
      options.onLibraryChanged();
    }
  }

  async function restore(): Promise<void> {
    busy = true;
    message = t('driveRestoreListing');
    paint();
    try {
      const files = await restoreDriveFiles(undefined, ({ done, total }) => {
        message = fill(t('driveRestoring'), { done, total });
        paint();
      });
      if (options.isCurrent()) {
        message = files.length === 0 ? t('driveNoFiles') : t('driveChooseFiles');
        await options.importFiles(files);
      }
    } catch (error) {
      message = failureMessage(error, t('driveRestoreFailed'));
    } finally {
      busy = false;
      paint();
      options.onLibraryChanged();
    }
  }

  function failureMessage(error: unknown, fallback: string): string {
    if (error instanceof DriveAuthError) {
      clearGoogleDriveSession();
      resetDriveCache();
      return t('driveExpired');
    }
    if (error instanceof DriveNetworkError) return t('driveOffline');
    if (error instanceof DriveConfigError) return t('driveNeedsClient');
    return fallback;
  }

  const onNetwork = (): void => {
    if (!options.isCurrent()) {
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      return;
    }
    paint();
  };
  window.addEventListener('online', onNetwork);
  window.addEventListener('offline', onNetwork);

  const stopBackup = onBackupChange(() => {
    if (!options.isCurrent()) {
      stopBackup();
      return;
    }
    if (!busy) paint();
  });

  void readGoogleClientId().then((value) => {
    clientId = value;
    loaded = true;
    paint();
  });

  paint();
  return { element: panel, refresh: paint };
}
