import { access, cp, mkdtemp, rename, rm } from 'node:fs/promises';
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
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
} finally {
  await rm(staging, { recursive: true, force: true });
}
