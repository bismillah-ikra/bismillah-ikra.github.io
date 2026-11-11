import { randomUUID } from 'node:crypto';
import { access, cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildLessonArchive } from './tools/build-lesson-archive.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, 'site');
const output = join(root, 'dist');

await access(join(source, 'index.html'));
const staging = await mkdtemp(join(root, '.dist-'));
try {
  await cp(source, staging, { recursive: true });
  await buildLessonArchive(root, staging);
  execFileSync(process.execPath, [join(root, 'tools/build-question-pdfs.mjs'), join(staging, 'soru-pdf')], { stdio: 'inherit' });
  const release = randomUUID();
  const versioned = path => path.split('?')[0] + '?v=' + release;
  for (const page of ['index.html', 'dersler/index.html', 'dersler/pdf.html']) {
    const file = join(staging, page);
    const html = (await readFile(file, 'utf8'))
      .replace('<head>', `<head>\n  <meta name="site-release" content="${release}">`)
      .replace(/(<script\b[^>]*\bsrc="|<link rel="(?:stylesheet|icon)" href=")([^"]+)"/g,
        (_, start, path) => start + versioned(path) + '"')
      .replace(/'\.\/(catalog\.mjs|files\.json)'/g, (_, name) => "'" + versioned('./' + name) + "'");
    await writeFile(file, html);
  }
  await writeFile(join(staging, 'release.json'), JSON.stringify({ release }));
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
} finally {
  await rm(staging, { recursive: true, force: true });
}
