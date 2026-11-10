// Measures dist/ against the size budgets in REQ §7, so the numbers in the spec
// stay measured rather than assumed.
import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';

const BUDGET_GZIP = 1.5 * 1024 * 1024; // NFR-1: initial load, including the font
const BUDGET_RAW = 5 * 1024 * 1024; // NFR-2: install size, excluding recordings

const distDir = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const files = await walk(distDir);
let rawTotal = 0;
let gzipTotal = 0;
const rows = [];

for (const file of files) {
  const buffer = await readFile(file);
  const gzipped = gzipSync(buffer, { level: 9 }).length;
  rawTotal += buffer.length;
  gzipTotal += gzipped;
  rows.push({ name: relative(distDir, file), raw: buffer.length, gzipped });
}

rows.sort((a, b) => b.gzipped - a.gzipped);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log('dist/ contents (gzipped):');
for (const row of rows) console.log(`  ${row.name.padEnd(34)} ${kb(row.raw).padStart(10)} → ${kb(row.gzipped).padStart(9)}`);
console.log(`  ${'total'.padEnd(34)} ${kb(rawTotal).padStart(10)} → ${kb(gzipTotal).padStart(9)}`);
console.log(`budgets: NFR-1 ${kb(BUDGET_GZIP)} gzipped, NFR-2 ${kb(BUDGET_RAW)} raw`);

const failures = [];
if (gzipTotal > BUDGET_GZIP) failures.push(`gzipped total ${kb(gzipTotal)} exceeds NFR-1 ${kb(BUDGET_GZIP)}`);
if (rawTotal > BUDGET_RAW) failures.push(`raw total ${kb(rawTotal)} exceeds NFR-2 ${kb(BUDGET_RAW)}`);

if (failures.length) {
  console.error('\nSize budget exceeded:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('size budget OK');
