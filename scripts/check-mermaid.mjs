// Renders every Mermaid block in README.md and docs/**/*.md (or only in the files
// given as arguments) with the same Mermaid major version that GitHub uses.
// A block that does not render fails the check.
// With --export, a block whose first line is "%% export: <name>" is saved as
// docs/diagrams/<name>.svg.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { renderMermaid } from '@mermaid-js/mermaid-cli';

const root = path.resolve(import.meta.dirname, '..');
const exportMode = process.argv.includes('--export');
const exportDir = path.join(root, 'docs', 'diagrams');
const exportMarker = /^%%\s*export:\s*([a-z0-9-]+)\s*$/;

async function listMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function extractBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '```mermaid') continue;
    const start = i + 1;
    let end = start;
    while (end < lines.length && lines[end].trim() !== '```') end++;
    blocks.push({ line: start, definition: lines.slice(start, end).join('\n') });
    i = end;
  }
  return blocks;
}

const fileArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const files =
  fileArgs.length > 0
    ? fileArgs.map((file) => path.resolve(file))
    : [path.join(root, 'README.md'), ...(await listMarkdown(path.join(root, 'docs')))];
const browser = await puppeteer.launch({
  headless: 'shell',
  args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
});

let total = 0;
const failures = [];
try {
  for (const file of files) {
    const blocks = extractBlocks(await readFile(file, 'utf8'));
    for (const block of blocks) {
      total++;
      const where = `${path.relative(root, file)}:${block.line}`;
      try {
        const { data } = await renderMermaid(browser, block.definition, 'svg');
        const name = block.definition.split('\n')[0].match(exportMarker)?.[1];
        if (exportMode && name) {
          await mkdir(exportDir, { recursive: true });
          await writeFile(path.join(exportDir, `${name}.svg`), data);
          console.log(`exported ${where} -> docs/diagrams/${name}.svg`);
        }
      } catch (error) {
        failures.push(`${where}\n  ${String(error.message ?? error).split('\n').slice(0, 6).join('\n  ')}`);
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`Mermaid: ${failures.length} of ${total} diagrams failed to render.\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`Mermaid: all ${total} diagrams render.`);
