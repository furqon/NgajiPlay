import { expect, type Page } from '@playwright/test';

export const DB_MODULE = '/src/store/db.ts';

export interface SeedClip {
  id: string;
  page: number;
  surah: number;
  from: number;
  to: number;
  name: string;
  seconds: number;
}

/**
 * Seeds clips with real, decodable 8 kHz mono WAV tones: an exact duration and
 * genuine playback, without spending a second of test time on the recorder.
 * Runs against the dev server so the store module can be imported directly.
 */
export async function seed(page: Page, clips: SeedClip[]): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ modulePath, clips: items }) => {
      const tone = (seconds: number): Blob => {
        const rate = 8_000;
        const samples = Math.floor(rate * seconds);
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        const text = (offset: number, value: string): void => {
          for (let index = 0; index < value.length; index += 1) {
            view.setUint8(offset + index, value.charCodeAt(index));
          }
        };

        text(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        text(8, 'WAVE');
        text(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, rate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, 'data');
        view.setUint32(40, samples * 2, true);
        for (let index = 0; index < samples; index += 1) {
          view.setInt16(44 + index * 2, Math.sin((2 * Math.PI * 440 * index) / rate) * 3_000, true);
        }
        return new Blob([buffer], { type: 'audio/wav' });
      };

      const db = await import(/* @vite-ignore */ modulePath);
      await db.clearAll();
      for (const item of items) {
        const blob = tone(item.seconds);
        await db.putClip(
          {
            id: item.id,
            page: item.page,
            surah: item.surah,
            ayahStart: item.from,
            ayahEnd: item.to,
            mimeType: 'audio/wav',
            bytes: blob.size,
            durationMs: Math.round(item.seconds * 1000),
            createdAt: Date.UTC(2026, 10, 10, 9, 0),
            updatedAt: Date.UTC(2026, 10, 10, 9, 0),
            displayName: item.name,
            channels: 1,
          },
          blob,
        );
      }
    },
    { modulePath: DB_MODULE, clips },
  );

  await page.goto('/#/library');
  await expect(page.getByTestId('clip')).toHaveCount(clips.length);
}

/** `0:07` → 7. */
export async function elapsedSeconds(page: Page): Promise<number> {
  const text = (await page.getByTestId('player-elapsed').textContent()) ?? '0:00';
  const [minutes, seconds] = text.split(':').map(Number);
  return (minutes ?? 0) * 60 + (seconds ?? 0);
}

/** True when the first highlighted ayah sits fully inside the visible area. */
export async function playingAyahVisible(page: Page): Promise<boolean> {
  return page
    .locator('[data-ayah-playing="true"]')
    .first()
    .evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
}
