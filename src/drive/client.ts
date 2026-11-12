import { exportFileName } from '../recording/export';
import type { Clip } from '../types';
import { DriveAuthError, DriveNetworkError, DriveError } from './errors';
import { driveAccessToken } from './oauth';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FOLDER_NAME = 'ngajiPlay';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface DriveTransport {
  uploadClip(clip: Clip, blob: Blob, fileId?: string): Promise<string>;
  listClips(): Promise<DriveFile[]>;
  downloadFile(file: DriveFile): Promise<Blob>;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

class DriveFileMissingError extends DriveError {
  constructor() {
    super('Google Drive file no longer exists');
    this.name = 'DriveFileMissingError';
  }
}

function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json; charset=UTF-8' };
}

function boundary(): string {
  return `ngajiplay-${crypto.randomUUID()}`;
}

function multipartBody(metadata: unknown, blob: Blob, separator: string): Blob {
  const mimeType = blob.type || 'application/octet-stream';
  return new Blob([
    `--${separator}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${separator}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${separator}--`,
  ]);
}

function driveId(body: unknown): string {
  if (typeof body !== 'object' || body === null) throw new DriveError('Drive returned no id');
  const id = (body as { id?: unknown }).id;
  if (typeof id !== 'string' || id === '') throw new DriveError('Drive returned no id');
  return id;
}

export class DriveClient implements DriveTransport {
  private folder: Promise<string> | null = null;

  constructor(
    private readonly token: () => string = driveAccessToken,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  reset(): void {
    this.folder = null;
  }

  async ensureFolder(): Promise<string> {
    this.folder ??= this.findOrCreateFolder().catch((error: unknown) => {
      this.folder = null;
      throw error;
    });
    return this.folder;
  }

  private async findOrCreateFolder(): Promise<string> {
    const params = new URLSearchParams({
      q: `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: 'files(id)',
      pageSize: '1',
    });
    const response = await this.request(`${API}/files?${params.toString()}`);
    const body = (await response.json()) as { files?: Array<{ id?: unknown }> };
    const existing = body.files?.[0]?.id;
    if (typeof existing === 'string' && existing !== '') return existing;

    const created = await this.request(`${API}/files?fields=id`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    return driveId(await created.json());
  }

  async listClips(): Promise<DriveFile[]> {
    const folderId = await this.ensureFolder();
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`,
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size)',
        pageSize: '1000',
        orderBy: 'name_natural',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await this.request(`${API}/files?${params.toString()}`);
      const body = (await response.json()) as {
        nextPageToken?: unknown;
        files?: Array<{
          id?: unknown;
          name?: unknown;
          mimeType?: unknown;
          modifiedTime?: unknown;
          size?: unknown;
        }>;
      };

      for (const file of body.files ?? []) {
        if (typeof file.id !== 'string' || file.id === '') continue;
        files.push({
          id: file.id,
          name: typeof file.name === 'string' ? file.name : file.id,
          mimeType: typeof file.mimeType === 'string' ? file.mimeType : 'application/octet-stream',
          modifiedTime: typeof file.modifiedTime === 'string' ? file.modifiedTime : undefined,
          size: typeof file.size === 'string' ? file.size : undefined,
        });
      }
      pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : undefined;
    } while (pageToken);

    return files;
  }

  async downloadFile(file: DriveFile): Promise<Blob> {
    const response = await this.request(
      `${API}/files/${encodeURIComponent(file.id)}?alt=media`,
    );
    return response.blob();
  }

  async uploadClip(clip: Clip, blob: Blob, fileId?: string): Promise<string> {
    if (fileId) {
      try {
        return await this.writeFile(clip, blob, fileId);
      } catch (error) {
        if (!(error instanceof DriveFileMissingError)) throw error;
      }
    }
    return this.writeFile(clip, blob);
  }

  private async writeFile(clip: Clip, blob: Blob, fileId?: string): Promise<string> {
    const separator = boundary();
    const metadata: Record<string, unknown> = { name: exportFileName(clip) };
    if (!fileId) metadata.parents = [await this.ensureFolder()];

    const suffix = fileId ? encodeURIComponent(fileId) : '';
    const endpoint = fileId
      ? `${UPLOAD_API}/files/${suffix}?uploadType=multipart&fields=id`
      : `${UPLOAD_API}/files?uploadType=multipart&fields=id`;

    const response = await this.request(endpoint, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${separator}`,
      },
      body: multipartBody(metadata, blob, separator),
    });
    return driveId(await response.json());
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${this.token()}`);
      response = await this.fetcher(url, { ...init, headers });
    } catch (error) {
      if (error instanceof DriveError) throw error;
      throw new DriveNetworkError();
    }

    if (response.status === 401) throw new DriveAuthError();
    if (response.status === 404) throw new DriveFileMissingError();
    if (!response.ok) {
      let detail: string;
      try {
        detail = (await response.text()).slice(0, 200);
      } catch {
        detail = '';
      }
      throw new DriveError(
        `Google Drive request failed (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    return response;
  }
}

export const driveClient = new DriveClient();

export function resetDriveCache(): void {
  driveClient.reset();
}
