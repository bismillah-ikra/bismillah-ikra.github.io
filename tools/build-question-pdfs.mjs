import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2]);
const candidates = [process.env.PDF_CHROME, ...(process.platform === 'win32'
  ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  : ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome'])].filter(Boolean);
let chrome;
for (const candidate of candidates) { try { await access(candidate); chrome = candidate; break; } catch {} }
if (!chrome) throw Error('PDF üretimi için Chromium veya Chrome bulunamadı; PDF_CHROME ile yolunu belirtin.');
const work = await mkdtemp(join(tmpdir(), 'paylasim-questions-'));
const run = (cmd, args) => { const p = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 8*1024*1024 }); if (p.status !== 0) throw Error(`${cmd}: ${p.error || p.stderr || p.stdout}`); };
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const renderText = value => esc(value).replace(/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufeff]+(?:\s+[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufeff]+)*)/gu, '<bdi dir="rtl" lang="ar">$1</bdi>');
try {
  run(process.execPath, [join(root, 'tools/export-question-data.cjs'), work]);
  const courses = JSON.parse(await readFile(join(work, 'question-data.json'), 'utf8'));
  const latin = (await readFile(join(root, 'site/assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf'))).toString('base64');
  const bold = (await readFile(join(root, 'site/assets/pdfjs/standard_fonts/LiberationSans-Bold.ttf'))).toString('base64');
  const arabic = (await readFile(join(root, 'site/assets/NotoNaskhArabic-Regular.ttf'))).toString('base64');
  await mkdir(output, {recursive:true});
  for (const course of courses) {
    let body = `<h1>${esc(course.name)}</h1><p class="subtitle">Tüm çalışma soruları ve cevap anahtarı</p>`;
    for (const set of course.sets) {
      body += `<h2>${esc(set.name)}</h2>`;
      const topicIds = new Set(set.topics.map(topic => topic.id));
      for (const q of set.questions) {
        if (!topicIds.has(q.topic) || !Array.isArray(q.options) || q.correct < 0 || q.correct >= q.options.length)
          throw Error(`${course.name}: ${q.id} sorusunun haftası veya cevap anahtarı geçersiz.`);
      }
      for (const topic of set.topics) {
        const questions = set.questions.filter(q => q.topic === topic.id);
        if (!questions.length) continue;
        body += `<h3>${esc(topic.name)}</h3>` + questions.map((q,i) => `<section class="question"><strong>${i+1}. ${renderText(q.stem)}</strong><div class="options">${q.options.map((o,j) => `<div>${'ABCDE'[j]}) ${renderText(o.text)}</div>`).join('')}</div></section>`).join('');
      }
    }
    body += '<div class="answers"><h2>Cevap Anahtarı</h2>';
    for (const set of course.sets) {
      body += `<h3>${esc(set.name)}</h3>`;
      for (const topic of set.topics) {
        const qs = set.questions.filter(q => q.topic === topic.id);
        if (qs.length) body += `<p><b>${esc(topic.name)}:</b> ${qs.map((q,i)=>`${i+1}. ${'ABCDE'[q.correct]}`).join(' &nbsp; · &nbsp; ')}</p>`;
      }
    }
    body += '</div>';
    const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><style>
      @font-face{font-family:Questions;src:url(data:font/ttf;base64,${latin})} @font-face{font-family:Questions;src:url(data:font/ttf;base64,${bold});font-weight:700}
      @font-face{font-family:Arabic;src:url(data:font/ttf;base64,${arabic})} @page{size:A4;margin:17mm 19mm}
      body{font:10pt/1.42 Questions,sans-serif;color:#202a3b} h1{font-size:22pt;margin:0 0 4mm} .subtitle{color:#536173;margin-bottom:9mm}
      h2{font-size:15pt;margin:8mm 0 4mm;color:#253b62} h3{font-size:12pt;margin:6mm 0 3mm;color:#253b62;break-after:avoid}
      .question{margin:0 0 3mm;break-inside:avoid} .options{margin:1mm 0 0 5mm} .options div{margin:1mm 0} bdi{font:1.18em Arabic;unicode-bidi:isolate}
      .answers{break-before:page}.answers p{line-height:1.8}</style><body>${body}</body></html>`;
    const input = join(work, `${course.id}.html`); await writeFile(input, html);
    const pdf = join(output, `${course.id}.pdf`);
    run(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-pdf-header-footer',`--user-data-dir=${join(work,'chrome-profile')}`,`--print-to-pdf=${pdf}`,pathToFileURL(input).href]);
    const header = await readFile(pdf); if (header.subarray(0,5).toString() !== '%PDF-') throw Error(`PDF oluşturulamadı: ${course.name}`);
    console.log(`${course.name}: ${course.sets.reduce((n,s)=>n+s.questions.length,0)} soru`);
  }
} finally { await rm(work,{recursive:true,force:true}); }
