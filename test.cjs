const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const M=require('./dist/model.js');
const dataCtx={window:{}};vm.runInNewContext(fs.readFileSync('dist/data.js','utf8'),dataCtx);
const published=dataCtx.window.MUSKAM_DATA;
const topic={
  id:'sayilar',name:'Sayılar',subtitle:'Temel işlemler',summary:'Sayıları karşılaştır.',
  sections:[['Toplama','Sayıları birleştir.']],details:[['Ayrıntı','Toplamın sırası sonucu değiştirmez.']],
  goals:['Toplama yap.'],concepts:['Toplam'],example:'1 + 1 = 2',confusion:'İşlem işaretine dikkat et.',source:'Test kaynağı',links:[]
};
const makeQuestion=(prefix,i)=>({
  id:prefix+String(i).padStart(3,'0'),number:i,topic:topic.id,difficulty:'Kolay',
  stem:`${i} + 1 kaçtır?`,objective:'Toplama işlemi',correct:0,
  options:Array.from({length:4},(_,j)=>({text:String(i+1+j),explanation:'Bir ekleyerek sonucu bul.'}))
});
const D={
  version:'fixture-v1',topics:[topic],
  questions:Array.from({length:4},(_,i)=>makeQuestion('Q',i+1)),
  reinforcement:[makeQuestion('P',1),makeQuestion('P',2)],
  excerpts:[{topic:topic.id,title:'Test alıntısı',arabic:'مثال',translation:'Örnek'}],
  source:{title:'Test kaynağı'}
};
const lookup=Object.fromEntries([...D.questions,...D.reinforcement].map(q=>[q.id,q]));
let passed=0;function test(name,fn){fn();passed++;console.log('✓ '+name);}
test('Başlangıç boş; gerçek sonuç yokken temsili kayıt yok',()=>{const s=M.empty(D.version);assert.equal(Object.keys(s.records).length,0);assert.equal(s.history.length,0);});
test('Doğru + yanlış + boş = toplam, puan doğru/toplam',()=>{
  const r=M.createRun('exam',['Q001','Q002','Q003'],1000);M.answer(r,lookup.Q001,lookup.Q001.correct);M.answer(r,lookup.Q002,(lookup.Q002.correct+1)%4);
  const score=M.score(r,lookup);assert.equal(score.correct,1);assert.equal(score.wrong,1);assert.equal(score.blank,1);assert.equal(score.percent,33);assert.equal(score.correct+score.wrong+score.blank,3);
});
test('Deneme cevapları değişebilir; bitmeden sonuç kaydı yok',()=>{
  const s=M.empty(D.version),r=M.createRun('exam',['Q001'],0);M.answer(r,lookup.Q001,(lookup.Q001.correct+1)%4);assert.equal(s.history.length,0);M.answer(r,lookup.Q001,lookup.Q001.correct);M.finish(r,s,lookup,1000);
  assert.equal(s.records.Q001.lastCorrect,true);assert.equal(s.records.Q001.attempts,1);assert.equal(s.history.length,1);
});
test('Tamamlama ikinci kez kayıt üretmez; tamamlanan cevap değişmez',()=>{
  const s=M.empty(D.version),r=M.createRun('exam',['Q001'],0);M.answer(r,lookup.Q001,lookup.Q001.correct);M.finish(r,s,lookup,1000);M.finish(r,s,lookup,2000);
  assert.equal(s.records.Q001.attempts,1);assert.equal(s.history.length,1);assert.equal(M.answer(r,lookup.Q001,0),false);
});
test('Hızlı çözüm cevabı değiştirilebilir',()=>{const r=M.createRun('quick',['Q001'],0);assert.equal(M.answer(r,lookup.Q001,1),true);assert.equal(M.answer(r,lookup.Q001,2),true);assert.equal(r.answers.Q001,2);});
test('Soru kimliği ve seçenek aralığı doğrulanır',()=>{const r=M.createRun('exam',['Q001'],0);assert.equal(M.answer(r,lookup.Q002,1),false);assert.equal(M.answer(r,lookup.Q001,-1),false);assert.equal(M.answer(r,lookup.Q001,4),false);});
test('Son yanlış doğru çözülünce yanlış durumu güncellenir',()=>{
  const s=M.empty(D.version),q=lookup.Q001;M.record(s,q,(q.correct+1)%4,12,0);assert.equal(s.records.Q001.lastCorrect,false);
  M.record(s,q,q.correct,10,100);assert.equal(s.records.Q001.lastCorrect,true);assert.equal(s.records.Q001.attempts,2);assert.equal(s.records.Q001.wrongCount,1);assert.equal(s.records.Q001.correctCount,1);
});
test('Yer imleri yanlış kayıtlarından bağımsızdır',()=>{const s=M.empty(D.version);s.bookmarks.push('Q002');M.record(s,lookup.Q001,(lookup.Q001.correct+1)%4,1,0);assert.deepEqual(s.bookmarks,['Q002']);assert.equal(s.records.Q002,undefined);});
test('Eski kayıttan cevaplar ve yer imleri yüklenir; tekrar tarihleri kullanılmaz',()=>{
  const storage=fakeStorage(),s=M.empty(D.version),q=lookup.Q001;
  M.record(s,q,(q.correct+1)%4,1,0);s.bookmarks.push(q.id);
  M.persist(storage,{...s,reviews:{[q.id]:{stage:0,due:86400000}}},true);
  const restored=M.load(storage,D.version);
  assert.deepEqual(restored.state,s);
  assert.equal(restored.consent,true);
});
test('Çözüm süresi açıklama okuma süresinden ayrılır',()=>{
  const r=M.createRun('quick',['Q001','Q002'],0);M.tick(r,5000);M.answer(r,lookup.Q001,0);M.tick(r,25000);r.index=1;M.tick(r,35000);
  assert.equal(r.times.Q001,5);assert.equal(r.times.Q002,10);assert.equal(r.elapsed,35);assert.equal(M.score(r,lookup).average,7.5);
});
test('Süre bitişinde ölçüm son tarihle sınırlanır',()=>{const r=M.createRun('exam',['Q001'],0,1);M.tick(r,90000);assert.equal(r.elapsed,60);assert.equal(r.times.Q001,60);});
test('Türkçe arama: büyük İ, küçük ı ve diakritik',()=>{
  const items=D.questions.map(q=>({...q,topicName:D.topics.find(t=>t.id===q.topic).name})),s=M.empty(D.version);
  assert.ok(M.filter(items,s,{search:'SAYILAR'}).length);assert.ok(M.filter(items,s,{search:'KAÇTIR'}).length);assert.equal(M.normalize('İŞLEM'),M.normalize('işlem'));
});
test('Konu, zorluk, yeni/yanlış/kayıt filtreleri birlikte çalışır',()=>{
  const s=M.empty(D.version),q=lookup.Q001;M.record(s,q,(q.correct+1)%4,1,0);s.bookmarks=['Q001'];
  assert.equal(M.filter(D.questions,s,{status:'new'}).length,D.questions.length-1);assert.equal(M.filter(D.questions,s,{status:'wrong'}).length,1);
  assert.equal(M.filter(D.questions,s,{status:'saved',topic:'sayilar',difficulty:'Kolay'}).length,1);
});
function fakeStorage(){const map=new Map();return {map,getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('Yerel saklama varsayılan kapalı; onayla kaydet, kapatınca sil',()=>{
  const storage=fakeStorage(),s=M.empty(D.version);assert.equal(M.load(storage,D.version).consent,false);M.persist(storage,s,false);assert.equal(storage.map.size,0);
  M.record(s,lookup.Q001,lookup.Q001.correct,2,0);M.persist(storage,s,true);assert.equal(M.load(storage,D.version).state.records.Q001.lastCorrect,true);
  M.persist(storage,s,false);assert.equal(storage.map.size,0);
});
test('Sürüm değişiminde kayıtlar korunur; bozuk kayıt ve depolama hatası güvenli karşılanır',()=>{
  const storage=fakeStorage(),old=M.empty('old');old.theme='dark';old.bookmarks=['Q001'];M.persist(storage,old,true);
  const restored=M.load(storage,D.version);
  assert.equal(restored.state.version,D.version);assert.equal(restored.state.theme,'dark');assert.deepEqual(restored.state.bookmarks,['Q001']);assert.equal(restored.consent,true);
  storage.setItem('muskam-progress','{bad');assert.equal(M.load(storage,D.version).consent,false);
  assert.equal(M.persist({setItem:()=>{throw Error()},removeItem:()=>{throw Error()}},M.empty(D.version),true),false);
});
function harness(data=D,localStorage=fakeStorage(),withImportedCourses=false){
  const nodes={},events={},winEvents={},intervals=[];let hash='#home',now=1000000;
  const node=id=>nodes[id]||(nodes[id]={id,innerHTML:'',textContent:'',open:false,dataset:{},value:'',checked:false,attrs:{},
    classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v},focus(){},addEventListener(k,fn){this[k]=fn},showModal(){this.open=true},close(){this.open=false}});
  const document={hidden:false,getElementById:node,querySelector:()=>null,documentElement:{dataset:{}},addEventListener:(k,fn)=>events[k]=fn};
  const window={document,localStorage,scrollTo(){},addEventListener:(k,fn)=>winEvents[k]=fn};
  const location={get hash(){return hash},set hash(v){hash=v.startsWith('#')?v:'#'+v}};
  class Clock extends Date{static now(){return now;}}
  const ctx=vm.createContext({window,document,location,Date:Clock,console,setTimeout:()=>0,clearTimeout(){},setInterval:fn=>intervals.push(fn)});
  window.MUSKAM_DATA=JSON.parse(JSON.stringify(data));
  const files=['dersler/courses.js','model.js','app.js'];
  if(withImportedCourses)files.unshift('course-data.js');
  for(const file of files)vm.runInContext(fs.readFileSync('./dist/'+file,'utf8'),ctx);
  return {nodes,node,window,document,events,intervals,app:window.MuskamApp,html:()=>node('main').innerHTML,
    nav(path){location.hash=path;winEvents.hashchange();},flush(){winEvents.hashchange();},advance(ms){now+=ms;intervals.forEach(fn=>fn());}};
}

test('Elli çalışma sonucu kaydedilir ve yeniden yüklenir',()=>{
  const storage=fakeStorage(),s=M.empty(D.version);
  for(let i=0;i<55;i++){const run=M.createRun('exam',['Q001'],i*1000);M.answer(run,lookup.Q001,0);M.finish(run,s,lookup,i*1000+100);}
  assert.equal(s.history.length,55);assert.equal(M.persist(storage,s,true),true);
  assert.equal(M.load(storage,D.version).state.history.length,55);
});
test('Devam eden çalışma, cevaplar, işaretler ve soru konumu yeniden yüklenir',()=>{
  const storage=fakeStorage(),h=harness(D,storage);
  h.events.change({target:{id:'remember',checked:true,dataset:{}}});
  h.app.actions['topic-quick']('sayilar');h.flush();
  h.app.actions.answer('1');h.app.actions.flag();h.app.actions.next();
  const reopened=harness(D,storage);reopened.nav('run');
  assert.equal(reopened.app.getRun().index,1);
  assert.equal(reopened.app.getRun().answers.Q001,1);
  assert.ok(reopened.app.getRun().flags.includes('Q001'));
  reopened.app.actions.previous();reopened.app.actions.answer('0');
  assert.equal(reopened.app.getState().records.Q001.lastAnswer,0);
  assert.equal(reopened.app.getState().records.Q001.attempts,1);
  reopened.app.actions['clear-answer']();
  assert.equal(Object.hasOwn(reopened.app.getRun().answers,'Q001'),false);
  assert.equal(reopened.app.getState().records.Q001,undefined);
  reopened.app.actions.flag();assert.equal(reopened.app.getRun().flags.length,0);
  const again=harness(D,storage);again.nav('run');
  assert.equal(Object.hasOwn(again.app.getRun().answers,'Q001'),false);
  assert.equal(again.app.getRun().flags.length,0);
});
test('Devam eden deneme cevapları ve süresi yeniden yüklenir',()=>{
  const storage=fakeStorage(),h=harness(D,storage);
  h.events.change({target:{id:'remember',checked:true,dataset:{}}});
  h.app.actions['start-exam']();h.flush();const run=h.app.getRun();
  h.app.actions.answer('1');h.app.actions.flag();h.app.actions.next();
  const reopened=harness(D,storage);reopened.nav('run');
  assert.equal(reopened.app.getRun().index,1);assert.equal(reopened.app.getRun().answers[run.ids[0]],1);
  assert.ok(reopened.app.getRun().flags.includes(run.ids[0]));
  reopened.app.actions.previous();reopened.app.actions['clear-answer']();
  assert.equal(Object.hasOwn(reopened.app.getRun().answers,run.ids[0]),false);
});
test('Depolama dolunca önceki kayıtlar silinmez ve sonraki kayıtta tekrar denenir',()=>{
  const storage=fakeStorage(),h=harness(D,storage);
  h.events.change({target:{id:'remember',checked:true,dataset:{}}});
  h.app.actions.bookmark('Q001');const before=storage.getItem('muskam-progress');
  const write=storage.setItem;storage.setItem=()=>{throw Error('quota');};
  h.app.actions.bookmark('Q002');assert.equal(h.app.getConsent(),true);
  assert.equal(storage.getItem('muskam-progress'),before);
  storage.setItem=write;h.app.actions.theme();
  assert.ok(M.load(storage,D.version).state.bookmarks.includes('Q002'));
});
test('Geçmiş çalışma cevapları incelenir ve yalnız seçilen sonuç silinir',()=>{
  const storage=fakeStorage(),h=harness(D,storage);
  h.events.change({target:{id:'remember',checked:true,dataset:{}}});
  h.app.actions.single('Q001');h.flush();h.app.actions.answer('1');
  h.app.actions.finish();h.node('confirm-ok').click();h.flush();
  const reopened=harness(D,storage);reopened.nav('analysis');
  assert.match(reopened.html(),/Çalışma|Son çalışmalar/);assert.match(reopened.html(),/İncele/);
  reopened.app.actions['view-history']('0');reopened.flush();
  assert.match(reopened.html(),/Cevabın:/);assert.match(reopened.html(),/Doğru cevap:/);
  reopened.nav('analysis');reopened.app.actions['remove-history']('0');
  assert.equal(reopened.node('confirm-dialog').open,true);reopened.node('confirm-ok').click();
  assert.equal(reopened.app.getState().history.length,0);assert.ok(reopened.app.getState().records.Q001);
});
test('Arayüz kontrolü: ana sayfa sahte puan içermez ve bütün temel ekranlar açılır',()=>{
  const h=harness();
  const homeText = h.html().replace(/<[^>]+>/g, ' ');
  assert.match(homeText,/Ders\s+Dosyaları/);
  assert.match(homeText,/Çalışma\s+Soruları/);
  assert.equal(h.node('nav').innerHTML,'');
  h.nav('sorular');
  assert.doesNotMatch(h.html(), /DERS SEÇİMİ/);
  assert.match(h.html(),/Din-Bilim İlişkisi/);
  const dinBilimLink = h.html().match(/<a\b[^>]*href="#academy"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.match(dinBilimLink ?? '', /Din-Bilim İlişkisi/);
  assert.match(h.html(),/Ek Dersler/);
  assert.equal(h.node('nav').innerHTML,'');
  h.nav('sorular/ek-dersler');
  assert.match(h.html(),/Hadis.*Kelam.*Tefsir/s);
  h.nav('sorular/kelam');
  assert.match(h.html(),/Ders dosyalarını aç/);
  assert.equal(h.node('nav').innerHTML,'');
  h.nav('sorular/din-bilim-iliskisi');
  assert.match(h.html(),/<h1>Konu anlatımları<\/h1>/);
  assert.doesNotMatch(h.html(),/href="#about"/);
  assert.match(h.node('nav').innerHTML,/Tek tek soru çöz.*Akademi.*Deneme sınavı.*Tüm sorular.*Yanlışlarım.*Tekrar defterim.*Başarı analizi/s);
  for(const route of ['academy','bank','exam','wrong','saved','analysis','settings','about',...D.topics.map(t=>'lesson/'+t.id)]){h.nav(route);assert.ok(h.html().includes('<h1>'),route);assert.ok(h.html().length>200,route);}
});
test('Arayüz kontrolü: hızlı cevap sonrası dört açıklama ve doğru gönderim',()=>{
  const h=harness();h.app.actions.single('Q001');h.flush();assert.ok(!h.html().includes('Dört seçenekten öğren'));h.advance(7000);
  h.app.actions.answer(String(lookup.Q001.correct));assert.ok(h.html().includes('Dört seçenekten öğren'));assert.equal((h.html().match(/class="explanation"/g)||[]).length,4);
  assert.equal(h.app.getState().records.Q001.lastCorrect,true);assert.equal(h.app.getState().records.Q001.lastTime,7);
});
test('Arayüz kontrolü: deneme navigasyon kilidi, değişen cevap ve bitiş incelemesi',()=>{
  const h=harness();h.app.actions['start-exam']();h.flush();const r=h.app.getRun(),q=lookup[r.ids[0]];
  h.app.actions.answer(String((q.correct+1)%4));h.app.actions.answer(String(q.correct));assert.ok(!h.html().includes('Dört seçenekten öğren'));
  assert.equal(Object.keys(h.app.getState().records).length,0);h.nav('inspect/'+q.id);assert.equal(h.html().includes('Dört seçenekten öğren'),false);h.flush();
  h.app.actions.finish();assert.equal(h.node('confirm-dialog').open,true);h.node('confirm-ok').click();h.flush();
  assert.equal(h.app.getRun().finished,true);assert.ok(h.html().includes('Konu bazında sonuç'));h.app.actions.review();h.flush();assert.ok(h.html().includes('Dört seçenekten öğren'));
});
test('Arayüz kontrolü: 23 soru ve 23 dakika ile başlayan deneme süre dolunca değerlendirilir',()=>{
  const h=harness(published);
  h.nav('exam');
  const weeks=new Set(['hafta-1','hafta-2','hafta-3']);
  for(const value of weeks) {
    h.events.change({target:{name:'exam-week',value,checked:true}});
  }
  assert.equal(h.node('exam-count').max,'45');
  h.node('exam-count').value='23';
  h.node('exam-minutes').value='23';
  h.events.submit({target:{id:'exam-form'},preventDefault(){}});
  h.flush();
  const run=h.app.getRun();
  assert.equal(run.ids.length,23);
  assert.equal(new Set(run.ids).size,23);
  assert.ok(run.ids.every(id=>weeks.has(published.questions.find(q=>q.id===id).topic)));
  assert.match(h.html(),/Kalan 23:00/);
  const first=published.questions.find(q=>q.id===run.ids[0]);
  const second=published.questions.find(q=>q.id===run.ids[1]);
  h.app.actions.answer(String(first.correct));
  h.app.actions.next();
  h.app.actions.answer(String((second.correct+1)%second.options.length));
  h.advance(23*60*1000-1000);
  assert.equal(run.finished,false);
  h.advance(1000);
  h.flush();
  assert.equal(run.finished,true);
  const {correct,wrong,blank}=h.app.getState().history[0];
  assert.deepEqual({correct,wrong,blank},{correct:1,wrong:1,blank:21});
});
test('Arayüz kontrolü: yer imi, tema, izin, temizleme ve pekiştirme kayıtları',()=>{
  const h=harness();h.app.actions.bookmark('P001');h.nav('saved');assert.ok(h.html().includes(lookup.P001.stem.slice(0,20)));
  h.app.actions.theme();assert.equal(h.document.documentElement.dataset.theme,'dark');
  h.events.change({target:{id:'remember',checked:true,dataset:{}}});assert.equal(h.app.getConsent(),true);assert.equal(h.window.localStorage.getItem('muskam-consent'),'yes');
  h.app.actions.clear();h.node('confirm-ok').click();assert.equal(h.app.getState().bookmarks.length,0);assert.equal(h.window.localStorage.map.size,0);
});
test('Çalışma ekranları tanıtım kutusu olmadan açılır',()=>{
  const h = harness(published);
  for (const route of ['academy', 'exam', 'bank', 'quick']) {
    h.nav(route);
    assert.doesNotMatch(h.html(), /class="section-guide"|Bir daha gösterme/, route);
  }
});
test('Arayüz kontrolü: üç anlatım seviyesi ve iki soruluk pekiştirme',()=>{
  const h=harness();h.nav('lesson/sayilar');h.app.actions.level('0');assert.ok(!h.html().includes('Toplamın sırası sonucu değiştirmez.'));
  h.app.actions.level('2');assert.ok(h.html().includes('Toplamın sırası sonucu değiştirmez.'));assert.ok(h.html().includes('Kaynak metni ve tam Türkçe anlamı aç'));
  h.app.actions.reinforce('sayilar');h.flush();assert.equal(h.app.getRun().ids.length,2);assert.ok(h.app.getRun().ids.every(id=>id.startsWith('P')));
});
test('Boş soru bankasında çalışmayan başlatma düğmesi yok',()=>{
  const h=harness({...D,topics:[],questions:[],reinforcement:[],excerpts:[]});
  for(const route of ['home','quick','academy','lesson/onceki-ders','bank','exam','wrong','saved','analysis','settings','about']){
    h.nav(route);
    assert.match(h.html(),/<h1/);
    assert.doesNotMatch(h.html(),/data-action="start-(quick|exam)"|100 soru/i);
  }
  h.nav('bank');assert.match(h.html(),/Henüz soru eklenmedi/);
  h.nav('quick');assert.equal(h.app.getRun(),null);
  assert.doesNotMatch(h.node('nav').innerHTML,/nav-count/);
});
test('On haftanın soruları beş seçenek ve geçerli cevap anahtarı içeriyor',()=>{
  assert.equal(published.topics.length,10);
  assert.equal(published.questions.length,155);
  assert.equal(new Set(published.questions.map(q=>q.id)).size,155);
  for(const t of published.topics)assert.equal(published.questions.filter(q=>q.topic===t.id).length,t.id==='hafta-10'?20:15);
  for(const q of published.questions){
    assert.equal(q.options.length,5);
    assert.ok(q.options[q.correct].text);
    assert.ok(q.explanation?.trim(), q.id);
  }
  const h=harness(published);
  h.nav('sorular/din-bilim-iliskisi');
  assert.match(h.html(),/<h1>Haftalara göre sorular<\/h1>/);
  assert.match(h.html(),/155 soru · 10 hafta/);
  assert.match(h.html(),/id="remember"/);
  h.nav('lesson/hafta-1');assert.equal((h.html().match(/class="bank-item"/g)||[]).length,15);
  h.app.actions['topic-quick']('hafta-1');h.flush();assert.equal(h.app.getRun().ids.length,15);
  h.nav('bank');
  for(const value of ['hafta-1','hafta-2','hafta-3']) {
    h.events.change({target:{name:'bank-week',value,checked:true}});
  }
  assert.match(h.node('bank-results').innerHTML,/45 soru listeleniyor/);
  h.events.change({target:{id:'bank-status',value:'saved'}});
  assert.match(h.node('bank-results').innerHTML,/0 soru listeleniyor/);
  h.events.change({target:{id:'bank-status',value:''}});
  h.app.actions['clear-bank-weeks']();
  assert.match(h.node('bank-results').innerHTML,/155 soru listeleniyor/);
});
test('Beşinci şık hızlı çözümde ve denemede kaydedilir',()=>{
  const h=harness(published),q=published.questions.find(q=>q.id==='Q10-12');
  h.app.actions.single(q.id);h.flush();
  assert.match(h.html(),/class="letter">E</);assert.doesNotMatch(h.html(),/Cevap açıklaması/);
  h.events.keydown({target:{matches:()=>false},key:'5',preventDefault(){}});
  assert.equal(h.app.getState().records[q.id].lastCorrect,true);
  assert.match(h.html(),/Cevap açıklaması/);assert.ok(h.html().includes(q.explanation));
  h.nav('exam');h.events.change({target:{name:'exam-week',value:q.topic,checked:true}});
  h.app.actions['exam-count']('20');h.app.actions['start-exam']();assert.equal(h.node('confirm-dialog').open,true);h.node('confirm-ok').click();h.flush();
  const examQuestionIndex=h.app.getRun().ids.indexOf(q.id);
  assert.ok(examQuestionIndex>=0);
  h.app.actions.jump(String(examQuestionIndex));
  h.app.actions.answer('4');assert.doesNotMatch(h.html(),/Cevap açıklaması/);
  h.app.actions.finish();h.node('confirm-ok').click();h.flush();
  assert.equal(h.app.getState().history.at(-1).correct,1);
  assert.equal(h.app.getState().records[q.id].lastAnswer,4);
});
test('Aktarılan sorular geçerli şıklar, cevap anahtarı ve açıklama içeriyor',()=>{
  const h=harness(published,fakeStorage(),true),data=h.window.PAYLASIM_COURSE_DATA;
  assert.equal(Object.keys(data).length,11);
  const counts=Object.values(data).reduce((sum,course)=>sum+course.questions.length,0);
  assert.equal(counts,1629);
  for(const [id,course] of Object.entries(data)){
    const weeks=new Set(course.topics.map(topic=>topic.id));
    assert.equal(new Set(course.questions.map(q=>q.id)).size,course.questions.length,id);
    for(const question of course.questions){
      assert.ok(weeks.has(question.topic)&&question.stem,id);
      assert.equal(question.options.length,id==='din-bilim-iliskisi'?5:4,id);
      assert.ok(Number.isInteger(question.correct)&&question.options[question.correct]?.text,id);
      const options=question.options.map(option=>option.text.trim());
      assert.ok(options.every(Boolean),question.id);
      assert.equal(new Set(options).size,options.length,question.id);
      assert.ok(question.explanation?.trim(),question.id);
      assert.doesNotMatch([question.stem, ...options, question.explanation].join(' '),/<\/?bdi\b/i,question.id);
    }
  }
});
test('10. hafta dört derste çözülebilir',()=>{
  const h=harness(published,fakeStorage(),true),sets=h.window.PAYLASIM_COURSE_DATA;
  for(const [slug,questions] of [
    ['din-bilim-iliskisi',published.questions],
    ['batida-islam-arastirmalari',sets['batida-islam-arastirmalari'].questions],
    ['guncel-fikhi-problemler',sets['guncel-fikhi-problemler'].questions],
    ['ornek-hadis-metinleri',sets['ornek-hadis-metinleri'].questions]
  ]){
    const weekly=questions.filter(q=>q.topic==='hafta-10');
    assert.equal(weekly.length,20,slug);
    assert.equal(weekly.map(q=>q.number).join(','),Array.from({length:20},(_,i)=>i+1).join(','),slug);
    assert.ok(weekly.every(q=>q.options[q.correct]?.text),slug);
    h.nav(slug==='din-bilim-iliskisi'?'lesson/hafta-10':`ders/${slug}/lesson/hafta-10`);
    assert.equal((h.html().match(/class="bank-item"/g)||[]).length,20,slug);
    h.app.actions.single(weekly[0].id);h.flush();
    h.events.keydown({target:{matches:()=>false},key:'1',preventDefault(){}});
    assert.match(h.html(),/Cevap açıklaması/,slug);
  }
});
test('Örnek Hadis 10. hafta yorum ve rivayet bağlamı korunur',()=>{
  const h=harness(published,fakeStorage(),true);
  const questions=h.window.PAYLASIM_COURSE_DATA['ornek-hadis-metinleri'].questions.filter(q=>q.topic==='hafta-10');
  const interpretation=questions.find(q=>q.number===9),silence=questions.find(q=>q.number===16);
  assert.match(interpretation.stem,/Ders notundaki yoruma göre/);
  assert.match(interpretation.explanation,/mizacı hakkında kesin bilgi vermez/);
  assert.equal(interpretation.correct,1);
  assert.match(silence.stem,/Hadiste.*sükût/);
  assert.equal(silence.correct,1);
});
test('Örnek Hadis 10. hafta PDF ve Word dosyaları arşivde yer alır',()=>{
  const files=JSON.parse(fs.readFileSync('dist/dersler/files.json','utf8')).files;
  for(const folder of ['ders-notlari','calisma-dosyalari']){
    const matches=files.filter(f=>f.course==='ornek-hadis-metinleri'&&f.folder===folder&&f.name.startsWith('10. '));
    assert.equal(matches.length,1,folder);
    assert.ok(matches[0].wordUrl,folder);
  }
});
test('Dört ve beş şıklı deneme havuzları ve çözüm kayıtları ayrıdır',()=>{
  const storage=fakeStorage(),h=harness(published,storage,true);
  const data=h.window.PAYLASIM_COURSE_DATA;
  const extraQuestions=data['din-bilim-iliskisi-4-sikli'].questions;
  for(const q of [...published.questions,...data['din-bilim-iliskisi'].questions,...extraQuestions]){
    assert.ok(q.explanation?.trim(),q.id);
    assert.equal(new Set(q.options.map(option=>option.text.trim())).size,q.options.length,q.id);
  }
  assert.ok(extraQuestions.every(q=>q.options.length===4&&Number.isInteger(q.correct)&&q.options[q.correct]?.text));
  const four='ders/din-bilim-iliskisi-4-sikli/';
  h.nav('academy');
  assert.match(h.html(),/174 soru · 10 hafta/);
  assert.doesNotMatch(h.node('nav').innerHTML,/<span>Ek sorular<\/span>/);
  assert.doesNotMatch(h.node('nav').innerHTML,/4 şıklı|5 şıklı/);
  h.app.actions.bookmark(published.questions[0].id);
  h.events.change({target:{id:'remember',checked:true}});
  h.nav(four+'academy');
  assert.match(h.html(),/<h1>Ek sorular<\/h1>/);
  assert.match(h.html(),/href="#academy"[^>]*>[^]*?Ana sorulara dön/);
  assert.match(h.html(),/160 soru · 9 hafta/);
  assert.match(h.html(),/din-bilim-iliskisi-4-sikli\/lesson\/hafta-1/);
  assert.equal(h.app.getState().bookmarks.length,0);
  const mainLinks=[...h.node('nav').innerHTML.matchAll(/href="#([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(mainLinks,['quick','academy','exam','bank','wrong','saved','analysis']);
  assert.doesNotMatch(h.html(),/Ek sorulardan deneme|Tüm sorular bir arada/);
  h.nav(mainLinks[3]);
  assert.match(h.node('bank-results').innerHTML,/174 soru listeleniyor/);
  assert.equal((h.node('bank-results').innerHTML.match(/class="letter">E</g)||[]).length,174);
  h.nav(four+'exam');
  h.events.change({target:{name:'exam-week',value:'hafta-1',checked:true}});
  h.app.actions['exam-count']('4');h.app.actions['start-exam']();h.flush();
  assert.equal(h.app.getRun().ids.length,4);
  assert.ok(h.app.getRun().ids.every(id=>id.startsWith('S-01-')));
  assert.doesNotMatch(h.html(),/class="letter">E</);
  h.app.actions.answer('0');
  h.nav('academy');
  assert.match(h.html(),/DENEME SINAVI/);
  h.flush();
  h.app.actions.finish();h.node('confirm-ok').click();h.flush();
  h.app.actions.review();h.flush();
  assert.match(h.html(),/<h3>Cevap açıklaması<\/h3>/);
  assert.doesNotMatch(h.html(),/Kaynak testte bu soru için açıklama yok/);
  h.nav('academy');
  assert.equal(h.app.getState().history.length,0);
  assert.equal(h.app.getState().bookmarks[0],published.questions[0].id);
  const reloaded=harness(published,storage,true);
  reloaded.nav(four+'analysis');
  assert.equal(reloaded.app.getState().history.length,1);
  reloaded.nav('sorular/kelam');
  assert.match(reloaded.html(),/160 soru · 8 hafta/);
  assert.equal(reloaded.node('current-course-name').textContent,'Kelam');
  assert.equal(reloaded.node('extra-question-nav').hidden,true);
  reloaded.events.change({target:{id:'remember',checked:false}});
  assert.equal(storage.map.size,0);
});
test('Ana ve ek sorular birlikte filtrelenir, kayıtlar karışmaz',()=>{
  const storage=fakeStorage(),h=harness(published,storage,true);
  h.window.PAYLASIM_COURSE_DATA['din-bilim-iliskisi-4-sikli'].questions[0].id='S-01-02';
  h.nav('bank');
  h.events.change({target:{id:'remember',checked:true}});
  h.events.change({target:{name:'bank-source',value:'extra',checked:true}});
  assert.match(h.node('bank-results').innerHTML,/334 soru listeleniyor/);
  assert.match(h.node('bank-results').innerHTML,/id="question-S-01-02"/);
  assert.match(h.node('bank-results').innerHTML,/id="question-extra-S-01-02"/);
  h.events.change({target:{name:'bank-source',value:'main',checked:false}});
  assert.match(h.node('bank-results').innerHTML,/160 soru listeleniyor/);
  h.events.change({target:{name:'extra-bank-week',value:'hafta-1',checked:true}});
  assert.match(h.node('bank-results').innerHTML,/18 soru listeleniyor/);
  const item={innerHTML:'',querySelector:()=>({focus(){}})};
  h.app.actions['extra-answer-card']('S-01-02/0',{closest:()=>item});
  assert.equal(h.app.getState().records['S-01-02'],undefined);
  assert.match(item.innerHTML,/Cevap açıklaması/);
  h.nav('ders/din-bilim-iliskisi-4-sikli/academy');
  assert.equal(h.app.getState().records['S-01-02'].lastAnswer,0);
  const reopened=harness(published,storage,true);
  reopened.window.PAYLASIM_COURSE_DATA['din-bilim-iliskisi-4-sikli'].questions[0].id='S-01-02';
  reopened.nav('ders/din-bilim-iliskisi-4-sikli/academy');
  assert.equal(reopened.app.getState().records['S-01-02'].lastAnswer,0);
});
test('Denemede ana ve ek başlıklar seçilir; kayıtlar yenilemede korunur',()=>{
  const storage=fakeStorage(),h=harness(published,storage,true);
  h.nav('academy');h.events.change({target:{id:'remember',checked:true}});
  assert.doesNotMatch(h.html(),/class="device-save"/);
  h.nav('exam');h.events.change({target:{name:'exam-source',value:'extra',checked:true}});
  h.events.change({target:{name:'exam-source',value:'main',checked:false}});
  h.events.change({target:{name:'exam-extra-week',value:'hafta-1',checked:true}});
  assert.equal(h.node('exam-count').max,'18');
  h.app.actions['exam-count']('4');h.app.actions['start-exam']();h.flush();
  const ids=Array.from(h.app.getRun().ids);
  assert.ok(ids.every(id=>id.startsWith('extra:S-01-')));
  h.app.actions.answer('0');h.app.actions.next();
  const reopened=harness(published,storage,true);reopened.nav('run');
  assert.deepEqual(Array.from(reopened.app.getRun().ids),ids);
  assert.equal(reopened.app.getRun().index,1);
  reopened.app.actions.finish();reopened.node('confirm-ok').click();reopened.flush();
  assert.equal(reopened.app.getState().records[ids[0]],undefined);
  reopened.nav('ders/din-bilim-iliskisi-4-sikli/academy');
  assert.equal(reopened.app.getState().records[ids[0].slice(6)].lastAnswer,0);
  reopened.nav('settings');assert.match(reopened.html(),/id="remember"[^>]* checked/);
  reopened.events.change({target:{id:'remember',checked:false}});
  assert.equal(storage.map.size,0);
});
test('Karma denemede seçilen haftalar ve ek başlıklar birlikte kullanılır',()=>{
  const h=harness(published,fakeStorage(),true);
  h.nav('exam');h.events.change({target:{name:'exam-source',value:'extra',checked:true}});
  h.events.change({target:{name:'exam-week',value:'hafta-1',checked:true}});
  h.events.change({target:{name:'exam-extra-week',value:'hafta-2',checked:true}});
  const total=Number(h.node('exam-count').max);assert.ok(total>=23);
  h.app.actions['exam-count'](String(total));h.app.actions['start-exam']();h.flush();
  const ids=Array.from(h.app.getRun().ids);
  assert.ok(ids.some(id=>id.startsWith('extra:S-02-')));
  assert.ok(ids.some(id=>!id.startsWith('extra:')));
  assert.ok(ids.filter(id=>id.startsWith('extra:')).every(id=>id.startsWith('extra:S-02-')));
  h.app.actions.finish();h.node('confirm-ok').click();h.flush();
  assert.match(h.html(),/Ek sorular/);
  h.nav('bank');assert.match(h.html(),/Tüm sorular bir arada/);
});
test('Aynı kimlikli ana ve ek sorular denemede ayrı kaydedilir',()=>{
  const h=harness(published,fakeStorage(),true);
  const set=h.window.PAYLASIM_COURSE_DATA['din-bilim-iliskisi-4-sikli'];
  set.questions[0].id=published.questions[0].id;
  h.nav('ders/kelam/academy');h.nav('exam');
  h.events.change({target:{name:'exam-source',value:'extra',checked:true}});
  h.events.change({target:{name:'exam-week',value:'hafta-1',checked:true}});
  h.events.change({target:{name:'exam-extra-week',value:'hafta-1',checked:true}});
  h.app.actions['exam-count'](String(h.node('exam-count').max));h.app.actions['start-exam']();h.flush();
  const ids=Array.from(h.app.getRun().ids),plain=published.questions[0].id,extra='extra:'+plain;
  assert.ok(ids.includes(plain)&&ids.includes(extra));
  h.app.actions.jump(String(ids.indexOf(plain)));h.app.actions.answer('0');
  h.app.actions.jump(String(ids.indexOf(extra)));h.app.actions.answer('1');
  h.app.actions.finish();h.node('confirm-ok').click();h.flush();
  assert.equal(h.app.getState().records[plain].lastAnswer,0);
  h.nav('ders/din-bilim-iliskisi-4-sikli/academy');
  assert.equal(h.app.getState().records[plain].lastAnswer,1);
});
test('Örnek Hadis sayılar ek seti başlık, cevap ve kayıtlarla çalışır',()=>{
  const storage=fakeStorage(),h=harness(published,storage,true);
  const data=h.window.PAYLASIM_COURSE_DATA['ornek-hadis-metinleri-ek'];
  assert.equal(data.parentCourse,'ornek-hadis-metinleri');
  assert.equal(data.questions.length,30);
  assert.equal(data.topics[0].name,'Sayılar');
  assert.ok(data.questions.every(q=>q.topic==='sayilar'&&q.options.length===4&&q.explanation));
  const thirty=data.questions.find(q=>q.id==='HAD-SAY-15');
  assert.equal(thirty.options[thirty.correct].text,'30');
  const twentyFifth=data.questions.find(q=>q.id==='HAD-SAY-29');
  assert.equal(twentyFifth.options[twentyFifth.correct].text,'الْخَامِسُ وَالْعِشْرُونَ');
  const extra='ders/ornek-hadis-metinleri-ek/';
  h.nav('ders/ornek-hadis-metinleri/academy');
  assert.doesNotMatch(h.node('nav').innerHTML,/<span>Ek sorular<\/span>/);
  h.nav(extra+'academy');
  assert.match(h.html(),/30 soru · 1 başlık/);
  assert.match(h.html(),/Sayılar/);
  h.nav(extra+'lesson/sayilar');
  assert.equal((h.html().match(/class="bank-item"/g)||[]).length,30);
  assert.match(h.html(),/Soruları sırayla çöz/);
  h.events.change({target:{id:'remember',checked:true}});
  h.app.actions.single(thirty.id);h.flush();
  h.app.actions.answer(String(thirty.correct));
  assert.match(h.html(),/Cevap açıklaması/);
  assert.equal(h.app.getState().records[thirty.id].lastCorrect,true);
  const reopened=harness(published,storage,true);
  reopened.nav(extra+'academy');
  assert.equal(reopened.app.getState().records[thirty.id].lastCorrect,true);
  reopened.nav('ders/ornek-hadis-metinleri/bank');
  reopened.events.change({target:{name:'bank-source',value:'extra',checked:true}});
  assert.match(reopened.node('bank-results').innerHTML,/230 soru listeleniyor/);
  reopened.events.change({target:{name:'bank-source',value:'main',checked:false}});
  assert.match(reopened.node('bank-results').innerHTML,/30 soru listeleniyor/);
  reopened.events.change({target:{name:'extra-bank-week',value:'sayilar',checked:true}});
  assert.match(reopened.node('bank-results').innerHTML,/30 soru listeleniyor/);
});
test('Tüm sorular menüsü ana ve ek soruların toplamını gösterir',()=>{
  const h=harness(published,fakeStorage(),true);
  const navCount=()=>Number(h.node('nav').innerHTML.match(/<span>Tüm sorular<\/span><span class="nav-count">(\d+)<\/span>/)?.[1]);
  h.nav('ders/ornek-hadis-metinleri/academy');
  assert.equal(navCount(),230);
  h.nav('ders/ornek-hadis-metinleri/bank');
  h.events.change({target:{name:'bank-source',value:'extra',checked:true}});
  assert.equal(navCount(),230);
  assert.match(h.node('bank-results').innerHTML,/230 soru listeleniyor/);
  h.nav('academy');
  assert.equal(navCount(),334);
  h.nav('bank');
  h.events.change({target:{name:'bank-source',value:'extra',checked:true}});
  assert.match(h.node('bank-results').innerHTML,/334 soru listeleniyor/);
  h.nav('ders/kelam/academy');
  assert.equal(navCount(),160);
  h.nav('ders/ornek-hadis-metinleri-ek/academy');
  assert.equal(navCount(),230);
});
test('Mobil menü ve filtreler kapanır, seçimler filtre yeniden çizilince korunur',()=>{
  const h=harness(published,fakeStorage(),true);
  h.nav('bank');
  assert.equal(h.document.documentElement.dataset.bankFilters,'closed');
  h.node('course-filter-toggle').click();
  assert.equal(h.document.documentElement.dataset.bankFilters,'open');
  assert.equal(h.node('course-menu-toggle').attrs['aria-expanded'],'false');
  h.events.change({target:{name:'bank-source',value:'extra',checked:true}});
  assert.equal(h.document.documentElement.dataset.bankFilters,'open');
  assert.match(h.node('bank-results').innerHTML,/334 soru listeleniyor/);
  h.node('course-menu-toggle').click();
  assert.equal(h.document.documentElement.dataset.bankFilters,'closed');
  h.node('course-filter-toggle').click();
  assert.equal(h.node('course-menu-toggle').attrs['aria-expanded'],'false');
  h.app.actions['close-bank-filters']();
  assert.equal(h.document.documentElement.dataset.bankFilters,'closed');
  h.nav('exam');
  assert.equal(h.node('course-filter-toggle').hidden,true);
});
test('Yanlış cevapta doğru ve yanlış etiketleriyle tek açıklama alanı açılır',()=>{
  const h=harness(published,fakeStorage(),true);
  h.nav('ders/ornek-hadis-metinleri/bank');
  const q=h.window.PAYLASIM_COURSE_DATA['ornek-hadis-metinleri'].questions[0];
  const item={innerHTML:'',querySelector:()=>({focus(){}})};
  h.app.actions['answer-card'](q.id+'/'+((q.correct+1)%q.options.length),{closest:()=>item});
  assert.match(item.innerHTML,/✓ Doğru cevap/);
  assert.match(item.innerHTML,/× Yanlış seçimin/);
  assert.equal((item.innerHTML.match(/class="answer-review"/g)||[]).length,1);
  assert.equal((item.innerHTML.match(/class="explanations"/g)||[]).length,1);
  assert.match(item.innerHTML,/class="feedback sr-only"/);
});
test('Ek sorular ayrı menü yerine tüm sorular filtresindedir',()=>{
  const h=harness(published,fakeStorage(),true);
  for(const id of ['batida-islam-arastirmalari','guncel-fikhi-problemler','hadis','islam-ticaret-hukuku','kelam','klasik-ve-cagdas-islami-dini-akimlar','tefsir']){
    h.nav('ders/'+id+'/academy');
    assert.doesNotMatch(h.node('nav').innerHTML,/<span>Ek sorular<\/span>/);
    h.nav('ders/'+id+'/bank');
    assert.match(h.html(),/Ek sorular/);
  }
});
test('Test PDF düğmeleri yalnız o testin sorularını kullanır',()=>{
  const h=harness(published,fakeStorage(),true), captured=[];
  h.window.QuestionPDF={download:(questions,title)=>{captured.push({questions,title});return Promise.resolve();}};
  h.nav('ders/ornek-hadis-metinleri-ek/lesson/sayilar');
  assert.match(h.html(),/data-action="pdf-topic"/);
  h.app.actions['pdf-topic']('sayilar',{textContent:'PDF',disabled:false});
  assert.equal(captured[0].questions.length,30);
  assert.ok(captured[0].questions.every(q=>q.topic==='sayilar'));
  h.app.actions.single('HAD-SAY-15');h.flush();
  h.app.actions.finish();h.node('confirm-ok').click();h.flush();
  assert.match(h.html(),/data-action="pdf-run"/);
  h.app.actions['pdf-run']('',{textContent:'PDF',disabled:false});
  assert.deepEqual(Array.from(captured[1].questions,q=>q.id),['HAD-SAY-15']);
});
test('Ders PDF verisi tüm ana ve ek soru kümelerini içerir',()=>{
  const os=require('node:os'),path=require('node:path'),child=require('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'question-export-test-'));
  try{
    child.execFileSync(process.execPath,['tools/export-question-data.cjs',dir]);
    const exported=JSON.parse(fs.readFileSync(path.join(dir,'question-data.json'),'utf8'));
    const ctx={window:{}};vm.runInNewContext(fs.readFileSync('site/course-data.js','utf8'),ctx);
    for(const course of exported){
      const extras=Object.values(ctx.window.PAYLASIM_COURSE_DATA).filter(set=>set.parentCourse===course.id);
      assert.equal(course.sets.length,extras.length+1,course.id);
      extras.forEach((set,i)=>assert.deepEqual(course.sets[i+1].questions.map(q=>q.id),Array.from(set.questions,q=>q.id)));
    }
    assert.equal(exported.find(c=>c.id==='din-bilim-iliskisi').sets[1].questions.length,160);
    assert.equal(exported.find(c=>c.id==='ornek-hadis-metinleri').sets[1].questions.length,30);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Dağıtılan varlıklarda izleyici, ağ çağrısı, belge veya kişisel kimlik yok',()=>{
  for(const file of ['app.js','model.js','index.html','style.css','data.js','course-data.js']){const text=fs.readFileSync('./dist/'+file,'utf8');
    assert.ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|gtag\s*\(|google-analytics|facebook\.net|MetaPixel/.test(text),file);
    assert.doesNotMatch(text,/basicsbros|libfile_|file_0000|\/workspace\/scratch|word\/comments|mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,file);
  }
  const html=fs.readFileSync('./dist/index.html','utf8');assert.ok(!/<(?:script|link)[^>]+(?:src|href)="https?:/.test(html));
});
console.log(`\n${passed} test grubu geçti. Gerçek tarayıcı render testi yapılmadı.`);
