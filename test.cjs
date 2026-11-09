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
  const document={hidden:false,getElementById:node,documentElement:{dataset:{}},addEventListener:(k,fn)=>events[k]=fn};
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
  assert.match(h.html(),/Din-Bilim İlişkisi/);
  assert.match(h.html(),/href="#academy"[^>]*>\s*<strong>Din-Bilim İlişkisi/);
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
test('Bir daha gösterme tercihi yalnız seçilen açıklamayı sonraki açılışta gizler',()=>{
  const first=harness(published);
  first.nav('exam');
  assert.match(first.html(),/Deneme nasıl çalışır/);
  first.app.actions['hide-guide']('exam',{closest:()=>({remove(){}})});
  const reopened=harness(published,first.window.localStorage);
  reopened.nav('exam');
  assert.doesNotMatch(reopened.html(),/Deneme nasıl çalışır/);
  reopened.nav('bank');
  assert.match(reopened.html(),/Bir daha gösterme/);
  assert.equal(reopened.app.getConsent(),false);
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
    assert.ok(q.explanation || q.topic === 'hafta-10');
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
  const h=harness(published),q=published.questions.find(q=>q.correct===4);
  h.app.actions.single(q.id);h.flush();
  assert.match(h.html(),/class="letter">E</);assert.doesNotMatch(h.html(),/Cevap açıklaması/);
  h.events.keydown({target:{matches:()=>false},key:'5',preventDefault(){}});
  assert.equal(h.app.getState().records[q.id].lastCorrect,true);
  assert.match(h.html(),/Cevap açıklaması/);assert.ok(h.html().includes(q.explanation));
  h.nav('exam');h.events.change({target:{name:'exam-week',value:q.topic,checked:true}});
  h.app.actions['exam-count']('15');h.app.actions['start-exam']();assert.equal(h.node('confirm-dialog').open,true);h.node('confirm-ok').click();h.flush();
  h.app.actions.jump(String(h.app.getRun().ids.indexOf(q.id)));
  h.app.actions.answer('4');assert.doesNotMatch(h.html(),/Cevap açıklaması/);
  h.app.actions.finish();h.node('confirm-ok').click();h.flush();
  assert.equal(h.app.getState().history.at(-1).correct,1);
  assert.equal(h.app.getState().records[q.id].lastAnswer,4);
});
test('Aktarılan soruların haftaları, şıkları ve cevap anahtarları geçerli',()=>{
  const h=harness(published,fakeStorage(),true),data=h.window.PAYLASIM_COURSE_DATA;
  assert.equal(Object.keys(data).length,10);
  const counts=Object.values(data).reduce((sum,course)=>sum+course.questions.length,0);
  assert.equal(counts,1579);
  for(const [id,course] of Object.entries(data)){
    const weeks=new Set(course.topics.map(topic=>topic.id));
    assert.equal(new Set(course.questions.map(q=>q.id)).size,course.questions.length,id);
    for(const question of course.questions){
      assert.ok(weeks.has(question.topic)&&question.stem,id);
      assert.equal(question.options.length,id==='din-bilim-iliskisi'?5:4,id);
      assert.ok(Number.isInteger(question.correct)&&question.options[question.correct]?.text,id);
      assert.ok(question.options.every(option=>option.text),id);
    }
  }
});
test('10. hafta üç derste çözülebilir',()=>{
  const h=harness(published,fakeStorage(),true),sets=h.window.PAYLASIM_COURSE_DATA;
  for(const [slug,questions] of [
    ['din-bilim-iliskisi',published.questions],
    ['batida-islam-arastirmalari',sets['batida-islam-arastirmalari'].questions],
    ['guncel-fikhi-problemler',sets['guncel-fikhi-problemler'].questions]
  ]){
    const weekly=questions.filter(q=>q.topic==='hafta-10');
    assert.equal(weekly.length,20,slug);
    assert.equal(weekly.map(q=>q.number).join(','),Array.from({length:20},(_,i)=>i+1).join(','),slug);
    assert.ok(weekly.every(q=>q.options[q.correct]?.text),slug);
    h.nav(slug==='din-bilim-iliskisi'?'lesson/hafta-10':`ders/${slug}/lesson/hafta-10`);
    assert.equal((h.html().match(/class="bank-item"/g)||[]).length,20,slug);
  }
});
test('Dört ve beş şıklı deneme havuzları ve çözüm kayıtları ayrıdır',()=>{
  const storage=fakeStorage(),h=harness(published,storage,true);
  const four='ders/din-bilim-iliskisi-4-sikli/';
  h.nav('academy');
  assert.match(h.html(),/174 soru · 10 hafta/);
  assert.match(h.node('extra-question-nav').innerHTML,/href="#ders\/din-bilim-iliskisi-4-sikli\/academy"[^>]*>[^]*?<span>Ek sorular<\/span>/);
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
  assert.match(h.html(),/href="#ders\/din-bilim-iliskisi-4-sikli\/exam">Ek sorulardan deneme/);
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
test('Dağıtılan varlıklarda izleyici, ağ çağrısı, belge veya kişisel kimlik yok',()=>{
  for(const file of ['app.js','model.js','index.html','style.css','data.js','course-data.js']){const text=fs.readFileSync('./dist/'+file,'utf8');
    assert.ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|gtag\s*\(|google-analytics|facebook\.net|MetaPixel/.test(text),file);
    assert.doesNotMatch(text,/basicsbros|libfile_|file_0000|\/workspace\/scratch|word\/comments|mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,file);
  }
  const html=fs.readFileSync('./dist/index.html','utf8');assert.ok(!/<(?:script|link)[^>]+(?:src|href)="https?:/.test(html));
});
console.log(`\n${passed} test grubu geçti. Gerçek tarayıcı render testi yapılmadı.`);
