import { describe, expect, it } from 'vitest';
import { DriveClient, type DriveFile } from '../../src/drive/client';
import { DriveAuthError } from '../../src/drive/errors';
import type { Clip } from '../../src/types';

const CREATED = Date.UTC(2026, 10, 10, 9, 0);

const clip: Clip = {
  id: '2:2',
  page: 2,
  surah: 2,
  ayahStart: 1,
  ayahEnd: 5,
  mimeType: 'audio/webm;codecs=opus',
  bytes: 5,
  durationMs: 4_321,
  createdAt: CREATED,
  updatedAt: CREATED,
  displayName: 'p002-s002-al-baqarah-a001-005.webm',
};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeClient(responses: Array<() => Response>): {
  client: DriveClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const client = new DriveClient(
    () => 'test-token',
    async (url, init = {}) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error(`unexpected request: ${url}`);
      return next();
    },
  );
  return { client, calls };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readBody(call: Call): Promise<string> {
  const body = call.init.body;
  if (!(body instanceof Blob)) throw new Error('expected a Blob body');
  return body.text();
}

describe('DriveClient', () => {
  it('creates ngajiPlay, uploads a multipart file and downloads it by id', async () => {
    const { client, calls } = fakeClient([
      () => json({ files: [] }),
      () => json({ id: 'folder-1' }),
      () => json({ id: 'file-1' }),
      () => new Response('audio-bytes', { headers: { 'Content-Type': 'audio/webm' } }),
    ]);

    const id = await client.uploadClip(clip, new Blob(['audio'], { type: clip.mimeType }));
    expect(id).toBe('file-1');
    expect(calls[1]?.url).toContain('drive/v3/files?fields=id');
    expect(calls[1]?.init.method).toBe('POST');

    const uploadBody = await readBody(calls[2]!);
    expect(calls[2]?.url).toContain('upload/drive/v3/files?uploadType=multipart');
    expect(uploadBody).toContain('"name":"p002-s002-al-baqarah-a001-005.webm"');
    expect(uploadBody).toContain('"parents":["folder-1"]');
    expect(calls[2]?.init.headers).toBeInstanceOf(Headers);
    expect((calls[2]?.init.headers as Headers).get('Content-Type')).toContain(
      'multipart/related; boundary=',
    );

    const blob = await client.downloadFile({
      id: 'file-1',
      name: 'p002-s002.webm',
      mimeType: 'audio/webm',
    });
    expect(await blob.text()).toBe('audio-bytes');
    expect(calls[3]?.url).toContain('/files/file-1?alt=media');
  });

  it('lists every page in the app folder with the minimal fields', async () => {
    const { client, calls } = fakeClient([
      () => json({ files: [{ id: 'folder-1' }] }),
      () => json({
        nextPageToken: 'next',
        files: [
          { id: 'f1', name: 'one.webm', mimeType: 'audio/webm', modifiedTime: '2026-11-10T09:00:00Z' },
        ],
      }),
      () => json({
        files: [
          { id: 'f2', name: 'two.m4a', mimeType: 'audio/mp4', size: '12' },
        ],
      }),
    ]);

    const files = await client.listClips();
    expect(files.map((file) => file.id)).toEqual(['f1', 'f2']);
    expect(files[0]?.modifiedTime).toBe('2026-11-10T09:00:00Z');
    expect(files[1]?.size).toBe('12');

    const query = new URL(calls[1]!.url).searchParams;
    expect(query.get('q')).toContain("'folder-1' in parents");
    expect(query.get('q')).toContain('trashed=false');
    expect(query.get('fields')).toBe('nextPageToken,files(id,name,mimeType,modifiedTime,size)');
    expect(new URL(calls[2]!.url).searchParams.get('pageToken')).toBe('next');
  });

  it('recreates a file that disappeared and maps the new Drive id', async () => {
    const { client, calls } = fakeClient([
      () => json({}, 404),
      () => json({ files: [{ id: 'folder-1' }] }),
      () => json({ id: 'new-file' }),
    ]);

    const id = await client.uploadClip(clip, new Blob(['audio']), 'old-file');
    expect(id).toBe('new-file');
    expect(calls[0]?.init.method).toBe('PATCH');
    expect(calls[0]?.url).toContain('/files/old-file?uploadType=multipart');
    expect(calls[2]?.init.method).toBe('POST');
    expect(await readBody(calls[2]!)).toContain('"parents":["folder-1"]');
  });

  it('turns an expired token into a reconnection error', async () => {
    const { client } = fakeClient([() => json({}, 401)]);
    await expect(client.listClips()).rejects.toBeInstanceOf(DriveAuthError);
  });

  it('rejects a folder response without an id', async () => {
    const { client } = fakeClient([
      () => json({ files: [] }),
      () => json({ name: 'no id' }),
      () => json({ id: 'never' }),
    ]);
    await expect(
      client.uploadClip(clip, new Blob(['audio']), undefined),
    ).rejects.toThrow('Drive returned no id');
  });
});

describe('DriveFile contract', () => {
  it('keeps optional metadata optional', () => {
    const file: DriveFile = { id: 'f', name: 'f.webm', mimeType: 'audio/webm' };
    expect(file.modifiedTime).toBeUndefined();
  });
});
