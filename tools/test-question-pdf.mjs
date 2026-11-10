import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const candidates=[process.env.PDF_CHROME,...(process.platform==='win32'
  ? ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  : ['/usr/bin/chromium-browser','/usr/bin/chromium','/usr/bin/google-chrome'])].filter(Boolean);
let browser;
for(const path of candidates){try{await access(path);browser=path;break;}catch{}}
if(!browser)throw new Error('PDF tarayıcı testi için Chrome veya Chromium gerekli.');
const root=resolve('dist'), profile=await mkdtemp(join(tmpdir(),'question-pdf-test-'));
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));
  if(!file.startsWith(root+(/[\\/]$/.test(root)?'':'/')) && !file.startsWith(root+'\\')){res.writeHead(403).end();return;}
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body);}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws;
try{
  let port;
  for(let i=0;i<150&&!port;i++){try{[port]=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/);}catch{await delay(100);}}
  assert.ok(port,'Tarayıcı başlatılamadı.');
  const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',bad,{once:true});});
  let sequence=0;const pending=new Map();
  ws.addEventListener('message',({data})=>{const result=JSON.parse(data),item=pending.get(result.id);if(!item)return;pending.delete(result.id);result.error?item.bad(new Error(result.error.message)):item.ok(result.result);});
  const send=(method,params={})=>new Promise((ok,bad)=>{const id=++sequence;pending.set(id,{ok,bad});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/#home`});
  let ready=false;
  for(let i=0;i<150&&!ready;i++){try{ready=await evaluate('!!(window.QuestionPDF && window.PAYLASIM_COURSE_DATA)');}catch{}if(!ready)await delay(100);}
  assert.ok(ready,'Soru uygulaması yüklenemedi.');
  const result=await evaluate(`(async()=>{
    const questions=[...window.MUSKAM_DATA.questions,...Object.values(window.PAYLASIM_COURSE_DATA).flatMap(set=>set.questions||[])]
      .filter(q=>/[\\u0600-\\u06ff]/u.test(q.stem+' '+q.options.map(o=>o.text).join(' ')));
    let blob;const original=URL.createObjectURL;URL.createObjectURL=function(value){blob=value;return original.call(URL,value)};
    await window.QuestionPDF.download(questions,'Arapça kopyalama testi');
    const pdfjs=await import('./assets/pdfjs/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./assets/pdfjs/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
    let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(item=>item.str).join('');
    const norm=s=>s.replace(/\\s+/g,'').normalize('NFC');text=norm(text);
    const missing=[];for(const q of questions)for(const item of [q.stem,...q.options.map(o=>o.text)])if(!text.includes(norm(item)))missing.push(q.id);
    return {count:questions.length,missing};
  })()`);
  assert.ok(result.count>0,'Arapça soru bulunamadı.');
  assert.deepEqual(result.missing,[],`PDF metninde eksik veya hatalı soru: ${result.missing.join(', ')}`);
  console.log(`✓ ${result.count} Arapça soru ve şık PDF metninde doğrulandı`);
}finally{
  if(ws)ws.close();chrome.kill();server.close();await delay(500);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
