import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const assets = new Map([
  ['/question-pdf.js', 'application/javascript'],
  ['/assets/pdf-lib/pdf-lib.min.js', 'application/javascript'],
  ['/assets/pdf-lib/fontkit.umd.min.js', 'application/javascript'],
  ['/assets/pdf-lib/bidi.min.js', 'application/javascript'],
  ['/assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf', 'font/ttf'],
  ['/assets/pdfjs/standard_fonts/LiberationSans-Bold.ttf', 'font/ttf'],
  ['/assets/NotoNaskhArabic-Regular.ttf', 'font/ttf']
]);

export async function openQuestionPdfBrowser(chrome, site, profile) {
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end('<!doctype html><html lang="tr"><script src="/question-pdf.js"></script></html>');
      return;
    }
    const type = assets.get(request.url);
    if (!type) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(join(site, request.url.slice(1)));
      response.writeHead(200, { 'Content-Type': type }).end(body);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `http://127.0.0.1:${server.address().port}/`
  ], { stdio: 'ignore', windowsHide: true });
  let startupError;
  child.once('error', error => { startupError = error; });
  let socket;
  async function close() {
    socket?.close();
    child.kill();
    server.close();
    await delay(500);
  }

  try {
    let port;
    for (let i = 0; !port && i < 150; i++) {
      if (startupError || child.exitCode !== null)
        throw startupError || new Error('PDF tarayıcısı erken kapandı.');
      try { [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/); }
      catch { await delay(100); }
    }
    if (!port) throw new Error('PDF tarayıcısı başlatılamadı.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const { id, result, error } = JSON.parse(data);
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      if (error) request.reject(new Error(error.message));
      else request.resolve(result);
    });
    socket.addEventListener('close', () => {
      for (const request of pending.values()) request.reject(new Error('PDF tarayıcısı kapandı.'));
      pending.clear();
    });
    const evaluate = async expression => {
      const result = await new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({
          id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true }
        }));
      });
      if (result.exceptionDetails)
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (let i = 0; !(await evaluate('!!window.QuestionPDF')); i++) {
      if (i === 100) throw new Error('PDF üreticisi yüklenemedi.');
      await delay(50);
    }
    return {
      async render(title, sets) {
        const encoded = await evaluate(`(async (title, sets) => {
          const questions = sets.flatMap(set => set.topics.flatMap(topic => topic.questions));
          const file = await window.QuestionPDF.download(questions, title, sets);
          try {
            const blob = await (await fetch(file.url)).blob();
            return await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } finally { URL.revokeObjectURL(file.url); }
        })(${JSON.stringify(title)}, ${JSON.stringify(sets)})`);
        return Buffer.from(encoded, 'base64');
      },
      close
    };
  } catch (error) {
    await close();
    throw error;
  }
}
