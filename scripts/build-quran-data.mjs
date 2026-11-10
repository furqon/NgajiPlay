// Builds public/quran.json from the pinned Tanzil files in assets/quran/.
// Every build re-verifies both SHA-256 pins, so a changed upstream file fails
// loudly instead of silently altering the mushaf (REQ §8.1).
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const sources = JSON.parse(await read('assets/quran/SOURCES.json'));

for (const file of sources.files) {
  const buffer = await readFile(new URL(file.path, root));
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  if (sha256 !== file.sha256 || buffer.length !== file.bytes) {
    throw new Error(
      `${file.path} does not match its pin.\n  expected ${file.bytes} B ${file.sha256}\n  actual   ${buffer.length} B ${sha256}\n` +
        'Re-download from the recorded URL, then update SOURCES.json and REQ §8.1 deliberately.',
    );
  }
}

const text = await read('assets/quran/quran-uthmani.txt');
const xml = await read('assets/quran/quran-data.xml');
const namesId = JSON.parse(await read('assets/quran/surah-names-id.json'));

// The copyright block must ship with the data (FR-7.5), so keep it verbatim.
const copyright = text
  .split(/\r?\n/)
  .filter((line) => line.startsWith('#'))
  .map((line) => line.replace(/^#\s?/, ''))
  .join('\n')
  .trim();

const ayahLines = text
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '' && !line.startsWith('#'));

if (ayahLines.length !== 6236) {
  throw new Error(`expected 6236 ayah lines, found ${ayahLines.length}`);
}

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : null;
};

const surahTags = [...xml.matchAll(/<sura\s[^>]*>/g)].map((match) => match[0]);
const pageTags = [...xml.matchAll(/<page\s[^>]*>/g)].map((match) => match[0]);

if (surahTags.length !== 114) throw new Error(`expected 114 surahs, found ${surahTags.length}`);
if (pageTags.length !== 604) throw new Error(`expected 604 pages, found ${pageTags.length}`);

const surahs = surahTags.map((tag, index) => {
  const n = Number(attr(tag, 'index'));
  const ayahCount = Number(attr(tag, 'ayas'));
  const start = Number(attr(tag, 'start'));
  const nameId = namesId[index];
  if (n !== index + 1) throw new Error(`surah ${index + 1} has index ${n}`);
  if (typeof nameId !== 'string' || nameId.length === 0) throw new Error(`missing Indonesian name for surah ${n}`);
  return {
    n,
    nameId,
    nameEn: attr(tag, 'tname'),
    nameMeaning: attr(tag, 'ename'),
    nameAr: attr(tag, 'name'),
    ayahCount,
    start,
    ayahs: ayahLines.slice(start, start + ayahCount),
  };
});

// Each surah's declared start must line up with the flat ayah list.
let runningAyah = 0;
for (const surah of surahs) {
  if (surah.ayahs.length !== surah.ayahCount) {
    throw new Error(`surah ${surah.n} expected ${surah.ayahCount} ayahs, got ${surah.ayahs.length}`);
  }
  if (surah.start !== runningAyah) throw new Error(`surah ${surah.n} start offset is inconsistent`);
  runningAyah += surah.ayahCount;
}
if (runningAyah !== 6236) throw new Error(`surah ayah total is ${runningAyah}, expected 6236`);

/** Global 0-based index of a surah/ayah pair. */
function globalIndex(surah, ayah) {
  const entry = surahs[surah - 1];
  if (!entry) throw new Error(`ayah ${surah}:${ayah} refers to a missing surah`);
  if (ayah < 1 || ayah > entry.ayahCount) throw new Error(`ayah ${surah}:${ayah} is out of range`);
  return entry.start + ayah - 1;
}

const pageStarts = pageTags.map((tag) => {
  const number = Number(attr(tag, 'index'));
  return { number, surah: Number(attr(tag, 'sura')), ayah: Number(attr(tag, 'aya')) };
});

if (pageStarts[0].surah !== 1 || pageStarts[0].ayah !== 1) throw new Error('page 1 does not start at 1:1');

// A page runs from its start up to the ayah before the next page's start.
const pages = pageStarts.map((start, index) => {
  const from = globalIndex(start.surah, start.ayah);
  const next = pageStarts[index + 1];
  const to = next ? globalIndex(next.surah, next.ayah) - 1 : ayahLines.length - 1;
  if (to < from) throw new Error(`page ${start.number} is empty or inverted`);

  // Split the page into one slice per surah it contains (REQ §4).
  const slices = [];
  let cursor = from;
  while (cursor <= to) {
    const surah = surahFor(cursor);
    const sliceStart = cursor;
    while (cursor <= to && surahFor(cursor) === surah) cursor += 1;
    slices.push([surah, sliceStart - surahs[surah - 1].start + 1, cursor - 1 - surahs[surah - 1].start + 1]);
  }
  return { number: start.number, from, to, slices };
});

function surahFor(index) {
  for (const surah of surahs) {
    if (index >= surah.start && index < surah.start + surah.ayahCount) return surah.n;
  }
  throw new Error(`index ${index} is outside every surah`);
}

// Assert coverage: every ayah lands on exactly one page, numbering is 1..604.
if (pages[0].from !== 0) throw new Error('page 1 does not begin at the first ayah');
for (let i = 1; i < pages.length; i += 1) {
  if (pages[i].from !== pages[i - 1].to + 1) throw new Error(`gap or overlap before page ${pages[i].number}`);
  if (pages[i].number !== pages[i - 1].number + 1) throw new Error('page numbering is not contiguous');
}
if (pages[pages.length - 1].to !== ayahLines.length - 1) throw new Error('last page does not reach the final ayah');

// Spot checks against known printed Madani pages.
const expectedPages = {
  1: [[1, 1, 7]],
  2: [[2, 1, 5]],
  3: [[2, 6, 16]],
  604: [[112, 1, 4], [113, 1, 5], [114, 1, 6]],
};
for (const [page, expected] of Object.entries(expectedPages)) {
  const actual = pages[Number(page) - 1].slices;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`page ${page} slices are ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

const output = {
  meta: {
    source: 'Tanzil Quran Text (Uthmani, Version 1.1)',
    license: 'Creative Commons Attribution 3.0',
    url: 'https://tanzil.net',
    hash: sources.files[0].sha256,
    ayahCount: ayahLines.length,
    pageCount: pages.length,
    copyright,
  },
  surahs,
  pages,
};

const outDir = new URL('public/', root);
await mkdir(outDir, { recursive: true });
const json = JSON.stringify(output);
await writeFile(new URL('quran.json', outDir), json);

console.log(
  `quran.json: ${(json.length / 1024).toFixed(0)} KB raw, ${surahs.length} surahs, ${ayahLines.length} ayahs, ${pages.length} pages`,
);
