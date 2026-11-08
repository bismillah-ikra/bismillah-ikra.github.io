import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { courses, folders } from '../site/dersler/catalog.mjs';
import { buildWord } from '../word-archive.mjs';

export async function buildLessonArchive(root, output) {
  const wordDirectory = join(root, 'word-archive');
  const wordManifest = JSON.parse(await readFile(join(wordDirectory, 'manifest.json'), 'utf8'));
  const files = [];

  for (const [course] of courses) {
    for (const folder of Object.keys(folders)) {
      const source = join(root, 'pdf-archive', course, folder);
      const destination = join(output, 'materials', course, folder);
      const entries = await readdir(source, { withFileTypes: true }).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      await mkdir(destination, { recursive: true });

      for (const { name: filename } of entries.filter(entry => entry.isFile() && /\.pdf$/i.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
        const pdf = await readFile(join(source, filename));
        if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error(`Geçersiz PDF: ${filename}`);
        await writeFile(join(destination, filename), pdf);

        const urlPrefix = `/materials/${course}/${folder}/`;
        const record = {
          course,
          folder,
          name: filename.replace(/^[a-f0-9-]{36}-/i, ''),
          size: pdf.length,
          url: urlPrefix + encodeURIComponent(filename),
          version: createHash('sha256').update(pdf).digest('hex').slice(0, 16),
          wordUrl: null
        };
        const word = wordManifest[`${course}/${folder}/${filename}`];
        if (word) {
          const wordFilename = filename.replace(/\.pdf$/i, '.docx');
          await writeFile(join(destination, wordFilename), await buildWord(word.entries, join(wordDirectory, 'parts')));
          const wordVersion = createHash('sha256').update(JSON.stringify(word.entries)).digest('hex').slice(0, 16);
          record.wordUrl = urlPrefix + encodeURIComponent(wordFilename) + '?v=' + wordVersion;
          record.wordName = word.name;
        }
        files.push(record);
      }
    }
  }

  await writeFile(join(output, 'dersler', 'files.json'), JSON.stringify({ files }));
  console.log(`Ders arşivi: ${files.length} PDF, ${files.filter(file => file.wordUrl).length} Word dosyası.`);
}
