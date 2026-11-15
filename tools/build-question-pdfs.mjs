import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { answerExplanation, answerLetters, buildQuestionDocx } from './question-docx.mjs';
import { openQuestionPdfBrowser } from './question-pdf-browser.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2]);
const wordOutput = process.argv[3] && resolve(process.argv[3]);
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
let copyablePdfBrowser;
try {
  run(process.execPath, [join(root, 'tools/export-question-data.cjs'), work]);
  const courses = JSON.parse(await readFile(join(work, 'question-data.json'), 'utf8'));
  const latin = (await readFile(join(root, 'site/assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf'))).toString('base64');
  const bold = (await readFile(join(root, 'site/assets/pdfjs/standard_fonts/LiberationSans-Bold.ttf'))).toString('base64');
  const arabic = (await readFile(join(root, 'site/assets/NotoNaskhArabic-Regular.ttf'))).toString('base64');
  await mkdir(output, {recursive:true});
  if (wordOutput) await mkdir(wordOutput, {recursive:true});
  for (const course of courses) {
    const sets = course.sets.map(set => {
      const topicIds = new Set(set.topics.map(topic => topic.id));
      for (const q of set.questions) {
        if (!topicIds.has(q.topic) || !Array.isArray(q.options) || q.options.length > answerLetters.length ||
            !Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length)
          throw Error(`${course.name}: ${q.id} sorusunun haftası veya cevap anahtarı geçersiz.`);
      }
      return {
        name: set.name,
        topics: set.topics.map(topic => ({
          name: topic.name, questions: set.questions.filter(q => q.topic === topic.id)
        })).filter(topic => topic.questions.length)
      };
    });
    const pdf = join(output, `${course.id}.pdf`);
    const hasArabic = sets.some(set => set.topics.some(topic => topic.questions.some(question =>
      [question.stem, ...question.options.map(option => option.text), answerExplanation(question)]
        .some(text => /\p{Script=Arabic}/u.test(text))
    )));
    if (hasArabic) {
      copyablePdfBrowser ??= await openQuestionPdfBrowser(chrome, join(root, 'site'), join(work, 'copyable-chrome'));
      const copyableSets = sets.map(set => ({
        ...set, topics: set.topics.map(topic => ({
          ...topic, questions: topic.questions.map(question => ({...question, explanation: answerExplanation(question)}))
        }))
      }));
      await writeFile(pdf, await copyablePdfBrowser.render(course.name, copyableSets));
    } else {
      let body = `<h1>${esc(course.name)}</h1><p class="subtitle">Tüm çalışma soruları ve açıklamalı cevaplar</p>`;
      for (const set of sets) {
        body += `<h2>${esc(set.name)}</h2>`;
        for (const { name, questions } of set.topics) {
          body += `<h3>${esc(name)}</h3>` + questions.map((q,i) => `<section class="question"><strong>${i+1}. ${renderText(q.stem)}</strong><div class="options">${q.options.map((o,j) => `<div>${answerLetters[j]}) ${renderText(o.text)}</div>`).join('')}</div></section>`).join('');
        }
      }
      body += '<div class="answers"><h2>Cevap Anahtarı</h2>';
      for (const set of sets) {
        body += `<h3>${esc(set.name)}</h3>`;
        for (const { name, questions } of set.topics) {
          body += `<p><b>${esc(name)}:</b> ${questions.map((q,i)=>`${i+1}.&nbsp;${answerLetters[q.correct]}`).join(' &nbsp; · &nbsp; ')}</p>`;
        }
      }
      body += '</div>';
      body += '<section class="explanations"><h2>Cevap Açıklamaları</h2>';
      const hasExtraSets = sets.length > 1;
      const topicHeading = hasExtraSets ? 'h4' : 'h3';
      for (const set of sets) {
        if (hasExtraSets) body += `<h3>${esc(set.name)}</h3>`;
        for (const { name, questions } of set.topics) {
          body += `<${topicHeading}>${esc(name)}</${topicHeading}>`;
          for (const [index, question] of questions.entries()) {
            body += `<section class="explanation"><strong>${index + 1}. soru · ${answerLetters[question.correct]} şıkkı</strong>
              <p>${renderText(answerExplanation(question))}</p></section>`;
          }
        }
      }
      body += '</section>';
      const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><style>
        @font-face{font-family:Questions;src:url(data:font/ttf;base64,${latin})} @font-face{font-family:Questions;src:url(data:font/ttf;base64,${bold});font-weight:700}
        @font-face{font-family:Arabic;src:url(data:font/ttf;base64,${arabic})} @page{size:A4;margin:17mm 19mm}
        body{font:10pt/1.42 Questions,sans-serif;color:#202a3b} h1{font-size:22pt;margin:0 0 4mm} .subtitle{color:#536173;margin-bottom:9mm}
        h2{font-size:15pt;margin:8mm 0 4mm;color:#253b62} h3{font-size:12pt;margin:6mm 0 3mm;color:#253b62;break-after:avoid}
        .question{margin:0 0 3mm;break-inside:avoid} .options{margin:1mm 0 0 5mm} .options div{margin:1mm 0} bdi{font:1.18em Arabic;unicode-bidi:isolate}
        .answers{break-before:page}.answers p{line-height:1.8}
        .explanations :is(h2,h3,h4){break-after:avoid}
        .explanations h4{font-size:11pt;margin:5mm 0 2.5mm;color:#253b62}
        .explanation{margin:0 0 3mm;break-inside:avoid}
        .explanation p{margin:1mm 0 0;white-space:pre-line;overflow-wrap:anywhere}
        </style><body>${body}</body></html>`;
      const input = join(work, `${course.id}.html`); await writeFile(input, html);
      run(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-pdf-header-footer',`--user-data-dir=${join(work,'chrome-profile')}`,`--print-to-pdf=${pdf}`,pathToFileURL(input).href]);
    }
    const header = await readFile(pdf); if (header.subarray(0,5).toString() !== '%PDF-') throw Error(`PDF oluşturulamadı: ${course.name}`);
    if (wordOutput) await writeFile(join(wordOutput, `${course.id}.docx`), buildQuestionDocx(course.name, sets));
    console.log(`${course.name}: ${course.sets.reduce((n,s)=>n+s.questions.length,0)} soru`);
  }
} finally {
  await copyablePdfBrowser?.close();
  await rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
