(function(){
  'use strict';
  const M=window.MuskamModel,main=document.getElementById('main');
  const navigation=document.getElementById('nav');
  const extraNavigation=document.getElementById('extra-question-nav');
  const courseSidebar=document.getElementById('course-sidebar');
  const menuToggle=document.getElementById('course-menu-toggle');
  const coursePicker=document.getElementById('course-picker');
  const { courses, extraCourseIds } = globalThis.PaylasimCatalog;
  const courseById = new Map(courses);
  const defaultCourse = 'din-bilim-iliskisi';
  const datasets={...window.PAYLASIM_COURSE_DATA};
  const original=window.MUSKAM_DATA, additions=datasets[defaultCourse];
  datasets[defaultCourse]=original;
  if(original.weekly&&additions){
    const weeks=new Map(original.topics.map((topic,index)=>[topic.id,index]));
    const questions=[...original.questions,...additions.questions]
      .sort((a,b)=>weeks.get(a.topic)-weeks.get(b.topic)||a.number-b.number);
    datasets[defaultCourse]={...original,questions,source:additions.source};
  }
  const extraSetsByCourse=new Map();
  for(const [id,set] of Object.entries(datasets)){
    if(courseById.has(set.parentCourse)&&set.questions.length)extraSetsByCourse.set(set.parentCourse,id);
  }
  let activeCourse=defaultCourse,D=datasets[defaultCourse],topics,lookup,weekOrTopic;
  const rememberLabel = 'İlerlememi bu cihazda kaydet';
  const letters='ABCDE';
  let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error()},removeItem:()=>{}};}
  const guideKey='paylasim-hidden-guides';
  const hiddenGuides=new Set();
  const dismissedGuides=new Set();
  try {
    const savedGuides=JSON.parse(storage.getItem(guideKey)||'[]');
    if(Array.isArray(savedGuides))for(const key of savedGuides)hiddenGuides.add(key);
  } catch {}
  const restored=M.load(storage,D.version);
  let state=restored.state,consent=restored.consent,theme=state.theme;
  const courseProgress=new Map([[defaultCourse,state]]);
  const courseRuns=new Map();
  let run=null,route='',renderedHash='',lessonLevel=1,teacherContext=null,confirmAction=null,toastTimer=null;
  const cardAnswers=new Map();
  let bankStatus='';
  const bankWeeks=new Set();
  const examWeeks=new Set();
  let examConfig={topic:'',count:Math.min(20,D.questions.length),minutes:0};
  function loadQuestions(){
    topics=Object.fromEntries(D.topics.map(t=>[t.id,t]));
    weekOrTopic=D.weekly?'Hafta':'Konu';
    const questions=[...D.questions,...D.reinforcement];
    for(const q of questions)q.topicName=topics[q.topic].name;
    lookup=Object.fromEntries(questions.map(q=>[q.id,q]));
    // Kayıtlar, soru kümesi geçici olarak değişse bile saklanır.
  }
  function restoreRun(saved){
    if(!saved||!['quick','exam','reinforce'].includes(saved.type)||!Array.isArray(saved.ids)||!saved.ids.length||
       new Set(saved.ids).size!==saved.ids.length||saved.ids.some(id=>!lookup[id])||
       !Number.isInteger(saved.index)||saved.index<0||saved.index>=saved.ids.length||
       !saved.answers||typeof saved.answers!=='object'||Array.isArray(saved.answers)||
       Object.entries(saved.answers).some(([id,value])=>!saved.ids.includes(id)||!Number.isInteger(value)||value<0||value>=lookup[id].options.length)||
       !saved.times||typeof saved.times!=='object'||Array.isArray(saved.times)||
       !Array.isArray(saved.flags)||!Number.isFinite(saved.elapsed)||saved.elapsed<0||
       (saved.deadline!==null&&!Number.isFinite(saved.deadline)))return null;
    const restoredRun={...saved,ids:[...saved.ids],answers:{...saved.answers},times:{...saved.times},flags:saved.flags.filter(id=>saved.ids.includes(id))};
    if(!restoredRun.finished)restoredRun.tickAt=Date.now();
    return restoredRun;
  }
  loadQuestions();
  run=restoreRun(state.activeRun);
  const progressKey=id=>id===defaultCourse?'muskam-progress':'muskam-progress:'+id;
  function loadCourseProgress(id){
    if(!courseProgress.has(id)){
      const progress=consent?M.load(storage,datasets[id].version,progressKey(id)).state:M.empty(datasets[id].version);
      courseProgress.set(id,progress);
    }
    return courseProgress.get(id);
  }
  function activateCourse(id){
    if(id===activeCourse)return;
    courseRuns.set(activeCourse,run);
    activeCourse=id;
    D=datasets[id];
    state=loadCourseProgress(id);
    loadQuestions();
    run=courseRuns.has(id)?courseRuns.get(id):restoreRun(state.activeRun);
    if(run&&!run.finished)run.tickAt=Date.now();
    bankStatus='';
    bankWeeks.clear();
    examWeeks.clear();
    examConfig={topic:'',count:Math.min(20,D.questions.length),minutes:0};
    teacherContext=null;
    lessonLevel=1;
  }
  const icon=(name)=>{const paths={home:'M3 10 10 4l7 6v8H6v-8M8 18v-6h4v6',bolt:'M11 2 4 12h6l-1 7 7-11h-6z',book:'M10 5C6 2 2 4 2 4v14s4-2 8 1c4-3 8-1 8-1V4s-4-2-8 1ZM10 5v14',grid:'M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z',exam:'M6 4H3v14h14V4h-3M7 2h6v4H7zM6 10h8M6 14h5',wrong:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM7 7l6 6M13 7l-6 6',save:'M5 3h10v15l-5-3-5 3z',chart:'M3 3v14h15M7 13V9M11 13V5M15 13V8',moon:'M16 12A7 7 0 0 1 8 3a7 7 0 1 0 8 9Z',sun:'M10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 1v2M10 17v2M1 10h2M17 10h2M4 4l1 1M15 15l1 1M4 16l1-1M15 5l1-1',arrow:'M4 10h12M11 5l5 5-5 5',flag:'M4 19V3h11l-2 4 2 4H4',back:'M15 10H4M9 5l-5 5 5 5',check:'M4 10l4 4 8-9'};return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${paths[name]||paths.book}"/></svg>`;};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rich=s=>esc(s).replace(/\p{Script=Arabic}[\p{Script=Arabic}\p{M}\u200c\u200d]*(?:[ \t]+\p{Script=Arabic}[\p{Script=Arabic}\p{M}\u200c\u200d]*)*/gu,x=>`<bdi lang="ar" dir="rtl">\u2067${x}\u2069</bdi>`);
  const btn=(label,action,id='',cls='primary')=>`<button class="${cls}" data-action="${action}"${id?` data-id="${esc(id)}"`:''}>${label}</button>`;
  const time=s=>{s=Math.max(0,Math.floor(s));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;};
  const date=ms=>new Date(ms).toLocaleDateString('tr-TR',{day:'numeric',month:'short'});
  const wrongIds=(dataset=D,progress=state)=>dataset.questions.filter(q=>progress.records[q.id]?.lastCorrect===false).map(q=>q.id);
  function save(allCourses=false){
    if(run||Object.hasOwn(state,'activeRun'))state.activeRun=run;
    const ids=allCourses?(consent?[...courseProgress.keys()]:Object.keys(datasets)):[activeCourse];
    let saved=true;
    for(const id of ids){
      const progress=courseProgress.get(id);
      if(progress)progress.theme=theme;
      if(!M.persist(storage,progress,consent,progressKey(id)))saved=false;
    }
    if(!saved)toast('Yeni değişiklik kaydedilemedi. Önceki kayıtlar korunuyor; tarayıcıda yeterli alan olduğundan emin ol.');
    refreshChrome();
    return saved;
  }
  function toast(text){const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
  function confirm(title,text,callback){const dialog=document.getElementById('confirm-dialog');document.getElementById('confirm-title').textContent=title;document.getElementById('confirm-text').textContent=text;confirmAction=callback;dialog.showModal();}
  const backLink=(href,label)=>`<a class="back-link" href="${esc(href)}"><span class="back-link-icon">${icon('back')}</span>${esc(label)}</a>`;
  const practicePath=(path,id=activeCourse)=>id===defaultCourse?path:`ders/${id}/${path}`;
  const practiceHref=(path,id=activeCourse)=>'#'+practicePath(path,id);
  function navigate(path){location.hash=practicePath(path);}
  const hasCourseQuestions=id=>Object.hasOwn(datasets,id)&&datasets[id].questions.length>0;
  const coursePath=id=>hasCourseQuestions(id)?practicePath('academy',id):`sorular/${id}`;
  function courseCount(id){
    if(!hasCourseQuestions(id))return 'Soru seti henüz yok';
    const count=`${datasets[id].questions.length} soru`;
    const extraId=extraSetsByCourse.get(id);
    return extraId?`${count} · ${datasets[extraId].questions.length} ek soru`:count;
  }
  const catalogId=()=>D.parentCourse??activeCourse;
  const isExtraSet=()=>catalogId()!==activeCourse;
  const courseTitle=(showSet=true)=>esc(courseById.get(catalogId()).toLocaleUpperCase('tr-TR'))+
    (showSet&&isExtraSet()?' · EK SORULAR':'');
  const navItems=[
    ['quick','bolt','Tek tek soru çöz'],
    ['academy','book','Haftalara göre sorular'],['exam','exam','Deneme sınavı'],
    ['bank','grid','Tüm sorular'],['wrong','wrong','Yanlışlarım'],
    ['saved','save','Tekrar defterim'],['analysis','chart','Başarı analizi']
  ];
  const guideCopy={
    quick:['Tek tek soru çöz','Şıkkını seçince doğru cevabı ve varsa açıklamasını görürsün. Sonraki düğmesiyle ilerlersin.'],
    academy:['Haftalara göre sorular','Bir hafta seçip o haftanın sorularını aç. Her soruyu sayfada yanıtlayabilir veya haftayı sırayla çözebilirsin.'],
    exam:['Deneme nasıl çalışır?','Haftaları, soru sayısını ve süreyi seç. Sorular seçtiğin haftalardan rastgele gelir. Deneme bitince cevaplarını inceleyebilirsin.'],
    bank:['Tüm sorular','Soruları listeden yanıtlayabilirsin. İstersen hafta seç ve listeyi çözüm durumuna göre daralt.']
  };
  function guide(id){
    if(hiddenGuides.has(id)||dismissedGuides.has(id))return '';
    const [title,description]=guideCopy[id];
    return `<aside class="section-guide" aria-label="Kısa bilgi">
      <div><strong>${title}</strong><p>${description}</p></div>
      <div class="guide-actions">
        ${btn('Anladım','dismiss-guide',id,'secondary')}
        ${btn('Bir daha gösterme','hide-guide',id,'text-button')}
      </div>
    </aside>`;
  }
  let menuOpen=false;
  function setCourseMenu(open,restoreFocus=false){
    menuOpen=open;
    menuToggle.setAttribute('aria-expanded',String(open));
    if(restoreFocus)menuToggle.focus();
  }
  const practicePages = new Set(['quick','academy','lesson','bank','exam','wrong','saved','analysis','settings','about','run','result','review','inspect','history']);
  function refreshChrome(){
    const page=route.split('/')[0];
    document.documentElement.dataset.page=page;
    const inPractice=practicePages.has(page);
    document.documentElement.dataset.view=inPractice?'practice':'portal';
    document.getElementById('practice-nav').setAttribute('aria-current',page==='sorular'||inPractice?'page':'false');
    let active=page;
    if(active==='lesson')active='academy';
    if(active==='history')active='analysis';
    if(['run','result','review'].includes(active))active=run?.type==='exam'?'exam':'quick';
    const navLink=([id,ic,label],course,count=0,current='')=>{
      return `<a href="${practiceHref(id,course)}"${current?` class="active" aria-current="${current}"`:''}>${icon(ic)}<span>${label}</span>${count?`<span class="nav-count">${count}</span>`:''}</a>`;
    };
    const parentId=catalogId();
    if(inPractice){
      const mainSet=datasets[parentId],mainProgress=loadCourseProgress(parentId);
      const wrongCount=wrongIds(mainSet,mainProgress).length;
      navigation.innerHTML=navItems.map(([id,ic,label])=>{
        const count=id==='bank'?mainSet.questions.length:id==='wrong'?wrongCount:0;
        const name=id==='academy'&&!mainSet.weekly?'Akademi':label;
        const current=parentId===activeCourse&&id===active?'page':'';
        const divider=id==='wrong'?'<div class="nav-divider" aria-hidden="true"></div>':'';
        return divider+navLink([id,ic,name],parentId,count,current);
      }).join('');
    }else navigation.innerHTML='';
    const extraId=inPractice?extraSetsByCourse.get(parentId):undefined;
    const extraCurrent=isExtraSet()?(active==='academy'?'page':'true'):'';
    extraNavigation.hidden=!extraId;
    extraNavigation.innerHTML=extraId?navLink(['academy','grid','Ek sorular'],extraId,datasets[extraId].questions.length,extraCurrent):'';
    const courseName=courseById.get(parentId);
    document.getElementById('current-course-name').textContent=courseName;
    document.getElementById('course-switch').setAttribute('aria-label',courseName+', ders değiştir');
    document.getElementById('course-switch-caption').textContent=isExtraSet()?'Ek sorular · Ders değiştir':'Ders değiştir';
    const settings=document.getElementById('course-settings');
    settings.setAttribute('href',practiceHref('settings'));
    settings.setAttribute('aria-current',active==='settings'?'page':'false');
    document.getElementById('footer-settings').setAttribute('href',practiceHref('settings'));
    const storageStatus=document.getElementById('storage-status');
    storageStatus.textContent=consent?'Bu tarayıcıda kayıt açık':'Yalnızca bu oturum';
    storageStatus.dataset.saved=String(consent);
    document.documentElement.dataset.theme=theme;
    const themeButton=document.getElementById('theme');
    themeButton.innerHTML=icon(theme==='dark'?'sun':'moon');
    themeButton.setAttribute('aria-label',theme==='dark'?'Açık temayı aç':'Koyu temayı aç');
  }
  const heading=(label,title,text='',extra='')=>`<div class="page-head">${label?`<div class="eyebrow">${label}</div>`:''}<div class="heading-row"><h1>${title}</h1>${extra}</div>${text?`<p>${text}</p>`:''}</div>`;
  const emptyContent=(label,title,text)=>heading(label,title)+`<div class="empty"><p>${text}</p></div>`;
  const stats=items=>`<div class="stat-grid">${items.map(([value,label])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>`;
  const lessonLabel=i=>`${i+1}. Ders`;
  function weekCards(){
    const cards=D.topics.map(t=>{
      const questions=D.questions.filter(q=>q.topic===t.id);
      const solved=questions.filter(q=>state.records[q.id]).length;
      const percent=questions.length?solved/questions.length*100:0;
      return `<a class="week-card" href="${practiceHref('lesson/'+t.id)}">
        <span class="week-card-title"><strong>${esc(t.name)}</strong>${icon('arrow')}</span>
        <span class="week-card-count">${solved}/${questions.length} çözüldü</span>
        <span class="progress" aria-hidden="true"><span style="width:${percent}%"></span></span>
      </a>`;
    });
    return `<div class="week-grid">${cards.join('')}</div>`;
  }
  function continuation(){
    if(run&&!run.finished)return {question:lookup[run.ids[run.index]],index:run.index};
    let latest=null;
    for(const q of D.questions){
      const record=state.records[q.id];
      if(record&&(!latest||(record.lastAt??0)>=(state.records[latest.id].lastAt??0)))latest=q;
    }
    if(!latest)return null;
    const startWeek=D.topics.findIndex(t=>t.id===latest.topic);
    const weeks=[...D.topics.slice(startWeek),...D.topics.slice(0,startWeek)];
    for(const {id} of weeks){
      const pending=D.questions.filter(q=>q.topic===id&&!state.records[q.id]);
      if(pending.length)return {question:pending[0],ids:pending.map(q=>q.id)};
    }
    return null;
  }
  function home(){
    main.innerHTML=`<section class="portal-intro">
      <h1><span class="portal-grade">3</span>. Sınıf <em>Dersleri</em></h1>
    </section>
    <div class="entry-grid">
      <a class="entry-card" href="./dersler/">
        <h2>Ders <span>Dosyaları</span></h2>
        <ul class="entry-details"><li>Ders notları</li><li>Çalışma dosyaları</li></ul>
        <span class="entry-go" aria-hidden="true">${icon('arrow')}</span>
      </a>
      <a class="entry-card entry-card-questions" href="#sorular">
        <h2>Çalışma <span>Soruları</span></h2>
        <ul class="entry-details"><li>Haftalık sorular</li><li>Denemeler</li><li>Tekrar</li></ul>
        <span class="entry-go" aria-hidden="true">${icon('arrow')}</span>
      </a>
    </div>
    <section class="ayet-karti" aria-label="Tâhâ suresi 114. ayet">
      <div class="ayet-sus" aria-hidden="true"><span></span></div>
      <p class="ayet-arapca" lang="ar" dir="rtl">رَبِّ زِدْنِي عِلْمًا</p>
      <p class="ayet-anlam">“Rabbim! İlmimi artır.”</p>
      <p class="ayet-kaynak">Tâhâ Suresi · 114. Ayet</p>
    </section>`;
  }

  function chooseCourse(id){
    const inExtras=id==='ek-dersler';
    const course=courseById.get(id);
    if(course){
      const isExtra=extraCourseIds.has(id);
      const back=isExtra?'#sorular/ek-dersler':'#sorular';
      const archive=isExtra?'ek-dersler/':'';
      main.innerHTML=backLink(back,isExtra?'Ek derslere dön':'Ders listesine dön')+
        heading('ÇALIŞMA SORULARI',esc(course),'',`<button class="secondary" type="button" data-action="switch-course" data-id="${esc(id)}" aria-haspopup="dialog" aria-controls="course-picker">Ders değiştir</button>`)+
        `<div class="empty"><p>Bu dersin çalışma soruları henüz eklenmedi.</p>
          <a class="secondary" href="./dersler/#dersler/${archive}${id}">Ders dosyalarını aç</a></div>`;
      return;
    }
    const cards=courses.filter(([id])=>extraCourseIds.has(id)===inExtras).map(([id,name])=>{
      return `<a class="course-card" href="#${coursePath(id)}">
        <div><h2>${esc(name)}</h2><span class="course-card-meta">${courseCount(id)}</span></div>
        <span class="course-card-arrow">${icon('arrow')}</span></a>`;
    }).join('');
    const extras=`<a class="course-card extras-card" href="#sorular/ek-dersler">
      <div><h2>Ek Dersler</h2><strong class="course-card-meta">HADİS · KELAM · TEFSİR</strong></div>
      <span class="course-card-arrow">${icon('arrow')}</span></a>`;
    main.innerHTML=backLink(inExtras?'#sorular':'#home',inExtras?'Ders listesine dön':'Ana sayfaya dön')+
      heading('DERS SEÇİMİ',inExtras?'Ek Dersler':'Çalışma Soruları')+
      `<section class="course-grid" aria-label="Ders listesi">${cards}${inExtras?'':extras}</section>`;
  }

  function openCoursePicker(currentCourse=catalogId()){
    if(run?.type==='exam'&&!run.finished){
      toast('Deneme sürüyor. Ders değiştirmek için önce denemeyi bitir.');
      return;
    }
    function courseGroup(title,extras){
      const options=courses.filter(([id])=>extraCourseIds.has(id)===extras).map(([id,name])=>{
        const label=`<span><strong>${esc(name)}</strong><small>${courseCount(id)}</small></span>`;
        const row=id===currentCourse
          ?`<span class="course-picker-option is-current" aria-current="true">${label}<span class="tag">Açık ders</span></span>`
          :`<a class="course-picker-option" href="#${coursePath(id)}">${label}${icon('arrow')}</a>`;
        return `<li>${row}</li>`;
      }).join('');
      return `<section class="course-picker-group"><h3>${title}</h3><ul>${options}</ul></section>`;
    }
    document.getElementById('course-picker-options').innerHTML=courseGroup('Dersler',false)+courseGroup('Ek Dersler',true);
    coursePicker.showModal();
  }

  function studyControls(){
    const canResume=D.weekly?continuation():run&&!run.finished;
    return `<div class="study-controls">
      <label class="device-save" for="remember">
        <span><strong>${rememberLabel}</strong><small id="remember-location">Açarsan cevapların ve sonuçların yalnızca bu cihazda ve tarayıcıda saklanır.</small></span>
        <input class="toggle" id="remember" type="checkbox" aria-label="${rememberLabel}" aria-describedby="remember-location"${consent?' checked':''}>
      </label>
      ${canResume?btn(`Kaldığın yerden devam et ${icon('arrow')}`,'resume'):''}
    </div>`;
  }
  function academy(){
    if(!D.topics.length){main.innerHTML=emptyContent('AKADEMİ','Henüz ders eklenmedi','Dersler eklendiğinde burada listelenecek.');return;}
    if(D.weekly){
      const title=isExtraSet()?'Ek sorular':'Haftalara göre sorular';
      const back=isExtraSet()?backLink(practiceHref('academy',catalogId()),'Ana sorulara dön'):'';
      const extraActions=isExtraSet()?`<nav class="actions extra-study-links" aria-label="Ek soru seçenekleri">
        <a class="secondary" href="${practiceHref('bank')}">Tüm ek sorular</a>
        <a class="secondary" href="${practiceHref('exam')}">Ek sorulardan deneme</a>
        <a class="secondary" href="${practiceHref('analysis')}">Ek soru ilerlemem</a>
      </nav>`:'';
      const pdfCourse=catalogId();
      const pdfName=courseById.get(pdfCourse);
      const pdfDownload=`<section class="question-pdf"><div><strong>Tüm sorular bir arada</strong><p>Haftalık soruları ve cevap anahtarını tek PDF olarak indir.</p></div><a class="secondary" href="./soru-pdf/${esc(pdfCourse)}.pdf" download="${esc(pdfName)} - Tüm Sorular.pdf">PDF indir ↓</a></section>`;
      main.innerHTML=back+heading(courseTitle(false),title,`${D.questions.length} soru · ${D.topics.length} hafta`)+studyControls()+pdfDownload+extraActions+guide('academy')+weekCards();
      return;
    }
    main.innerHTML=heading('AKADEMİ','Konu anlatımları','Ders anlatımlarını oku ve pekiştirme sorularıyla çalış.')+studyControls()+`<div class="lesson-grid">${D.topics.map((t,i)=>`<section class="lesson-card"><div class="meta-line"><span class="eyebrow lesson-number">${lessonLabel(i)}</span><span class="tag">${D.questions.filter(q=>q.topic===t.id).length} soru</span></div><h2>${t.name}</h2><small>${t.subtitle}</small><p>${rich(t.summary)}</p><a class="secondary" href="${practiceHref('lesson/'+t.id)}">Konuyu öğren ${icon('arrow')}</a></section>`).join('')}</div>`;
  }
  function sourceBox(t){return `<div class="source-box"><strong>Belge dayanağı</strong><br>${esc(t.source)}<br>${esc(D.source.title)}${t.links.map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('')}</div>`;}
  function lesson(id){const t=topics[id];if(!t)return academy();
    if(D.weekly){
      const questions=D.questions.filter(q=>q.topic===id);
      main.innerHTML=backLink(practiceHref('academy'),'Hafta listesine dön')+
        heading(isExtraSet()?'EK SORULAR':'HAFTALIK SORU SETİ',esc(t.name),`${questions.length} soru`)+
        `<div class="actions" style="margin-bottom:20px">${btn('Haftanın sorularını çöz','topic-quick',id)}</div><div class="bank-list">${questions.map(q=>card(q)).join('')}</div>`;
      return;
    }
    const context=lookup[teacherContext];const record=context&&state.records[context.id];
    main.innerHTML=backLink(practiceHref('academy'),'Konu listesine dön')+heading('AKADEMİ',t.name,t.subtitle)+`
    <div class="lesson-layout"><article class="lesson-body"><div class="tabs" role="group" aria-label="Anlatım seviyesi">${['Kısa Özet','Konuyu Öğren','Ayrıntılı Anlatım'].map((v,i)=>`<button class="${lessonLevel===i?'active':''}" data-action="level" data-id="${i}" aria-pressed="${lessonLevel===i}">${v}</button>`).join('')}</div>
    ${context?.topic===id&&record?.lastCorrect===false?`<div class="notice"><strong>Cevabından öğren</strong><p>${rich(context.options[record.lastAnswer].explanation)}</p><p class="small-copy">Çalışma hedefi: ${esc(context.objective)}. Bu bağlantı bir öğrenme önerisidir.</p></div>`:''}
    <div class="panel"><h3>Temel fikir</h3><p>${rich(t.summary)}</p></div>
    ${lessonLevel>0?t.sections.map(([title,text])=>`<section class="lesson-section"><h2>${title}</h2><p>${rich(text)}</p></section>`).join(''):''}
    ${lessonLevel===2?t.details.map(([title,text])=>`<section class="lesson-section"><h2>${title}</h2><p>${rich(text)}</p></section>`).join(''):''}
    ${lessonLevel>0?D.excerpts.filter(x=>x.topic===id).map(x=>`<details class="source-excerpt"><summary>Kaynak metni ve tam Türkçe anlamı aç</summary><h3 style="margin:20px 0 10px">${x.title}</h3><div class="arabic-block" lang="ar" dir="rtl">${esc(x.arabic)}</div><p>${esc(x.translation)}</p></details>`).join(''):''}
    <section class="lesson-section"><h2>Birlikte uygulayalım</h2><p>${rich(t.example)}</p></section><div class="notice"><strong>Sık karıştırılan nokta</strong><p>${rich(t.confusion)}</p></div>
    <div class="actions">${btn('2 pekiştirme sorusunu çöz','reinforce',id)}${btn('Bu konunun ana soruları','topic-quick',id,'secondary')}</div>${sourceBox(t)}</article>
    <aside class="lesson-aside"><div class="panel"><h3>Öğrenme hedefleri</h3><ul class="goals">${t.goals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="concepts">${t.concepts.map(x=>`<span class="tag">${rich(x)}</span>`).join('')}</div></div>
    <div class="panel"><h3>Konuyu sınayalım</h3><p class="small-copy">Bu konuya bağlı ${D.questions.filter(q=>q.topic===id).length} ana soru var. Pekiştirme soruları ayrı bir grupta bulunur.</p><a href="${practiceHref('bank')}" class="text-button">Tüm sorulara git →</a></div></aside></div>`;
  }
  function saveButton(id){const saved=state.bookmarks.includes(id);return `<button class="icon-button ${saved?'save-active':''}" data-action="bookmark" data-id="${id}" aria-label="${saved?'Yer imini kaldır':'Soruyu tekrar defterine kaydet'}" aria-pressed="${saved}" title="${saved?'Kaydedildi':'Kaydet'}">${icon('save')}</button>`;}
  function card(q){
    return `<article class="bank-item">${cardContents(q)}</article>`;
  }
  function cardContents(q){
    const r=state.records[q.id];
    const chosen=cardAnswers.get(q.id),answered=cardAnswers.has(q.id);
    return `<span class="number">${q.number.toString().padStart(2,'0')}</span>
      <div class="bank-content">
        <div class="meta-line"><span class="badge">${esc(q.topicName)}</span>${q.difficulty?`<span class="tag">${esc(q.difficulty)}</span>`:''}${q.id.startsWith('P')?'<span class="tag">Pekiştirme</span>':''}${r?`<span class="tag">Son cevap: ${r.lastCorrect?'doğru':'yanlış'}</span>`:''}</div>
        <h3 id="question-${q.id}">${rich(q.stem)}</h3>
        ${optionList(q,chosen,{reveal:answered,disabled:answered,inline:true})}
        ${answered?answerReview(q,chosen,true):''}
        ${r?`<div class="actions">${answered?btn('Yeniden çöz','retry-card',q.id,'text-button'):btn('Cevabımı incele','inspect',q.id,'text-button')}</div>`:''}
      </div>${saveButton(q.id)}`;
  }
  function topicOptions(value){return `<option value="">${D.weekly?'Tüm haftalar':'Tüm konular'}</option>${D.topics.map(t=>`<option value="${t.id}"${value===t.id?' selected':''}>${esc(t.name)}</option>`).join('')}`;}
  const questionsForWeeks=weeks=>weeks.size?D.questions.filter(q=>weeks.has(q.topic)):D.questions;
  function filtered(){return M.filter(questionsForWeeks(bankWeeks),state,{status:bankStatus});}
  const weekSummary=weeks=>weeks.size?weeks.size+' hafta seçildi':'Tüm haftalar';
  function weekPicker(scope,weeks,resetLabel){
    return `<details class="week-filter"${weeks.size?' open':''}>
      <summary id="${scope}-week-toggle">Hafta seç <span class="week-filter-summary" id="${scope}-week-summary" aria-live="polite">${weekSummary(weeks)}</span></summary>
      <p class="small-copy">Birden fazla hafta seçebilirsin. Seçim yapmazsan tüm haftalar dahil edilir.</p>
      <div class="week-filter-options" role="group" aria-label="Haftalar">${D.topics.map(({id,name})=>`
        <label class="week-filter-option"><input type="checkbox" name="${scope}-week" value="${esc(id)}"${weeks.has(id)?' checked':''}> ${esc(name)}</label>`).join('')}</div>
      <button class="text-button" type="button" id="clear-${scope}-weeks" data-action="clear-${scope}-weeks"${weeks.size?'':' disabled'}>${resetLabel}</button>
    </details>`;
  }
  function changeWeek(scope,weeks,input){
    if(input.checked)weeks.add(input.value);
    else weeks.delete(input.value);
    document.getElementById(scope+'-week-summary').textContent=weekSummary(weeks);
    document.getElementById('clear-'+scope+'-weeks').disabled=!weeks.size;
  }
  function bankResults(){const list=filtered();const results=document.getElementById('bank-results');if(!results)return;results.innerHTML=`<div class="list-summary"><span>${list.length} soru listeleniyor</span>${list.length?btn('Listelenen soruları çöz','filtered','','secondary'):''}</div><div class="bank-list">${list.length?list.map(q=>card(q)).join(''):'<div class="empty"><h3>Eşleşen soru yok</h3><p>Filtreleri değiştirerek diğer soruları görebilirsin.</p></div>'}</div>`;}
  function bank(){if(!D.questions.length){main.innerHTML=emptyContent('TÜM SORULAR','Henüz soru eklenmedi','Yeni sorular burada listelenecek.');return;}main.innerHTML=heading(courseTitle(),'Tüm sorular')+guide('bank')+`
    <label class="form-field bank-filter">Çözüm durumu
      <select id="bank-status">${[['','Tüm sorular'],['new','Henüz çözülmeyen'],['wrong','Son cevabı yanlış'],['saved','Kaydedilen']].map(([v,l])=>`<option value="${v}"${bankStatus===v?' selected':''}>${l}</option>`).join('')}</select>
    </label>
    ${D.weekly&&D.topics.length?weekPicker('bank',bankWeeks,'Tüm haftaları göster'):''}
    <div id="bank-results"></div>
    ${D.source.title?`<p class="source-box">Soru kaynağı · ${D.source.url?`<a href="${esc(D.source.url)}" target="_blank" rel="noopener noreferrer">${esc(D.source.title)}</a>`:esc(D.source.title)}</p>`:''}`;bankResults();}
  function collection(kind){const isWrong=kind==='wrong',ids=isWrong?wrongIds():state.bookmarks;const list=ids.filter(id=>lookup[id]).map(id=>lookup[id]);
    main.innerHTML=heading(isWrong?'':'TEKRAR DEFTERİM',isWrong?'Yanlışlarım':'Yeniden dönmek istediklerin.',isWrong?'Son cevabı yanlış olan ana sorular burada. Yeniden doğru çözdüğün soru bu listeden çıkar.':'Kaydettiğin sorular burada görünür. Yer imleri, yanlışlar listesinden bağımsız tutulur.')+
    (list.length?`<div class="list-summary"><span>${list.length} soru</span>${btn(isWrong?'Yanlışları yeniden çöz':'Kaydedilenleri çöz',isWrong?'retry-wrongs':'retry-saved','','secondary')}</div><div class="bank-list">${list.map(q=>card(q)).join('')}</div>`:`<div class="empty">${icon(isWrong?'check':'save')}<h3>${isWrong?'Henüz yanlış soru yok':'Defterin henüz boş'}</h3><p>${isWrong?'Cevaplarından sonra gerek duyduğun sorular burada görünecek.':'Soru kartındaki yer imi simgesini kullanarak bir soruyu kaydedebilirsin.'}</p><a href="${practiceHref('bank')}" class="secondary">Tüm sorulara git</a></div>`);
  }
  function start(type,ids,minutes=0){
    if(!ids.length)return toast('Bu seçimde çözülecek soru bulunmuyor.');
    const begin=()=>{run=M.createRun(type,ids,Date.now(),minutes);teacherContext=null;save();navigate('run');if(route==='run')render(false);};
    if(run&&!run.finished)return confirm('Yeni çalışma başlatılsın mı?', 'Devam eden çalışma kapanır; kaydedilmiş cevapların ve diğer sonuçların korunur.',begin);
    begin();
  }
  function explanation(q,inline=false){
    if(q.explanation)return `<section class="explanations"><h3>Cevap açıklaması</h3><p>${rich(q.explanation)}</p>${inline?'':`<div class="actions">${backLink(practiceHref('lesson/'+q.topic),D.weekly?'Haftanın sorularına dön':'Konuya dön')}</div>`}</section>`;
    if(!q.options.some(option=>option.explanation)){
      return `<section class="explanations"><h3>Doğru cevap</h3><p>${letters[q.correct]} · ${rich(q.options[q.correct].text)}</p><p class="small-copy">Kaynak testte bu soru için açıklama yok.</p></section>`;
    }
    return `<section class="explanations"><h3>Dört seçenekten öğren</h3>${q.options.map((o,i)=>`<details class="explanation" open><summary>${i===q.correct?'<span class="answer-tag">DOĞRU</span>':'<span class="tag">YANLIŞ</span>'} ${letters[i]} · ${rich(o.text)}</summary><p>${rich(o.explanation)}</p></details>`).join('')}<div class="notice"><strong>Konunun özeti</strong><p>${rich(topics[q.topic].summary)}</p></div><div class="actions">${btn('Konuyu öğren','learn',q.id,'secondary')}${btn('Pekiştirmeye geç','reinforce',q.topic,'secondary')}</div>${sourceBox(topics[q.topic])}</section>`;
  }
  function optionList(q,chosen,{reveal,disabled,inline}){
    const action=inline?'answer-card':'answer';
    const prefix=inline?q.id+'/':'';
    const label=inline?`aria-labelledby="question-${q.id}"`:'aria-label="Cevap seçenekleri"';
    return `<div class="options" role="group" ${label}>${q.options.map((o,i)=>{
      let cls=chosen===i?' selected':'';
      if(reveal&&i===q.correct)cls+=' correct';
      else if(reveal&&chosen===i)cls+=' wrong';
      return `<button class="option${cls}" data-action="${action}" data-id="${prefix}${i}" aria-pressed="${chosen===i}"${disabled?' disabled':''}><span class="letter">${letters[i]}</span><span class="option-copy"><span>${rich(o.text)}</span>${reveal&&i===q.correct?'<span class="status-text">✓ Doğru cevap</span>':reveal&&chosen===i?'<span class="status-text">× Cevabın</span>':''}</span></button>`;
    }).join('')}</div>`;
  }
  function answerReview(q,chosen,inline=false){
    const outcome=chosen===undefined?'blank':chosen===q.correct?'correct':'wrong';
    const message=outcome==='blank'?`Soru boş bırakıldı. Doğru cevap ${letters[q.correct]}.`
      :outcome==='correct'?'✓ Doğru cevap.':`× Doğru cevap ${letters[q.correct]}.`;
    return `<div class="answer-review" data-outcome="${outcome}">
      <div class="feedback${outcome==='wrong'?' is-wrong':''}"${inline?'':' id="run-answer-feedback"'} role="status" tabindex="-1"><strong>${message}</strong></div>
      ${explanation(q,inline)}
    </div>`;
  }
  function question(q,answers,indexLabel,reveal=false,readonly=false){
    const chosen=answers[q.id],answered=Object.hasOwn(answers,q.id);
    return `<div class="question-panel"><div class="question-top"><span class="badge">${esc(q.topicName)}</span>${q.difficulty?`<span class="tag">${esc(q.difficulty)}</span>`:''}${q.id.startsWith('P')?'<span class="tag">Pekiştirme</span>':''}<span class="tag">${indexLabel}</span>${saveButton(q.id)}</div><h2 class="question-stem">${rich(q.stem)}</h2>${optionList(q,chosen,{reveal,disabled:readonly})}
    ${reveal?answerReview(q,chosen):''}${!readonly&&answered?`<div class="actions">${btn('Cevabı kaldır','clear-answer','','text-button')}<span class="small-copy">Cevabını başka bir seçenekle değiştirebilirsin.</span></div>`:''}</div>`;
  }
  function runView(review=false){if(!run)return navigate('academy');const q=lookup[run.ids[run.index]],isExam=run.type==='exam',reveal=review||(!isExam&&Object.hasOwn(run.answers,q.id));
    main.innerHTML=`${!review&&run.type==='quick'&&run.index===0?guide('quick'):''}<div class="run-meta"><span>${review?'Cevap incelemesi':isExam?'DENEME SINAVI':run.type==='reinforce'?'PEKİŞTİRME':'TEK TEK SORU ÇÖZ'} · ${run.index+1}/${run.ids.length}</span><span class="timer" id="run-timer">${clock()}</span></div><div class="progress" style="margin-bottom:25px"><span style="width:${Object.keys(run.answers).length/run.ids.length*100}%"></span></div>
    <div class="question-layout"><section>${question(q,run.answers,`${run.index+1}. soru`,reveal,review)}<div class="question-bottom"><button class="secondary" data-action="previous"${run.index===0?' disabled':''}>${icon('back')} Önceki</button><div class="actions">${!review?btn(run.flags.includes(q.id)?'İşareti kaldır':'İşaretle','flag','','secondary'):''}${run.index===run.ids.length-1?btn(review?'Sonuca dön':'Çalışmayı bitir',review?'result':'finish'):btn('Sonraki '+icon('arrow'),'next')}</div></div></section>
    <aside class="panel palette-panel"><h3>Soru paleti</h3><p class="small-copy">${Object.keys(run.answers).length} cevap · ${run.ids.length-Object.keys(run.answers).length} boş</p><div class="palette">${run.ids.map((id,i)=>`<button data-action="jump" data-id="${i}" class="${i===run.index?'current ':''}${Object.hasOwn(run.answers,id)?'answered ':''}${run.flags.includes(id)?'flagged':''}" aria-label="${i+1}. soru${Object.hasOwn(run.answers,id)?', cevaplandı':', boş'}${run.flags.includes(id)?', işaretli':''}"${i===run.index?' aria-current="step"':''}>${i+1}</button>`).join('')}</div><p class="palette-legend">Dolgulu: cevaplandı<br>Alt çizgi: işaretlendi</p>${isExam&&!review?'<div class="notice">Cevaplar ve açıklamalar deneme bittikten sonra açılacak.</div>':''}${btn(review?'Sonuç ekranı':'Çalışmayı bitir',review?'result':'finish','','secondary')}</aside></div>`;
  }
  function clock(){if(!run)return '';if(run.finished)return time(run.elapsed);if(run.deadline)return 'Kalan '+time(Math.max(0,Math.ceil((run.deadline-Date.now())/1000)));return time(run.elapsed);}
  const examPool=()=>D.weekly
    ?questionsForWeeks(examWeeks)
    :D.questions.filter(q=>!examConfig.topic||q.topic===examConfig.topic);
  const examPresets=[10,20,30,40];
  function examPreset(action,value,label=value){
    return `<button type="button" data-action="${action}" data-id="${value}">${label}</button>`;
  }
  const examCountNote=count=>count?'1 ile '+count+' arasında bir sayı yaz.':'Seçilen haftalarda soru yok.';
  function examCountPresets(count){
    if(!count)return '';
    return examPresets.filter(n=>n<count).map(n=>examPreset('exam-count',n)).join('')+
      examPreset('exam-count',count,'Tümü');
  }
  function updateExamCountLimit(){
    const count=examPool().length;
    document.getElementById('exam-count').max=String(count);
    document.getElementById('exam-count-note').textContent=examCountNote(count);
    document.getElementById('exam-count-presets').innerHTML=examCountPresets(count);
    document.getElementById('exam-start').disabled=!count;
  }
  function exam(){
    if(!D.questions.length){main.innerHTML=emptyContent('DENEME SINAVI','Henüz soru eklenmedi','Sorular eklendiğinde deneme oluşturabilirsin.');return;}
    const count=examPool().length;
    main.innerHTML=heading(courseTitle(),'Deneme sınavı')+guide('exam')+
      `<form class="panel exam-setup" id="exam-form">
        <h2>Denemeni oluştur</h2>
        ${D.weekly?weekPicker('exam',examWeeks,'Tüm haftaları dahil et'):`<label class="form-field exam-field">${weekOrTopic}<select id="exam-topic">${topicOptions(examConfig.topic)}</select></label>`}
        <div class="form-grid exam-fields">
          <div>
            <label class="form-field exam-field">Soru sayısı
              <input id="exam-count" type="number" inputmode="numeric" min="1" max="${count}" step="1" value="${examConfig.count}" aria-describedby="exam-count-note" required>
            </label>
            <p class="small-copy" id="exam-count-note">${examCountNote(count)}</p>
            <div class="exam-numbers" id="exam-count-presets" role="group" aria-label="Hazır soru sayıları">${examCountPresets(count)}</div>
          </div>
          <div>
            <label class="form-field exam-field">Süre (dakika)
              <input id="exam-minutes" type="number" inputmode="numeric" min="1" step="1" value="${examConfig.minutes||''}" aria-describedby="exam-minutes-note">
            </label>
            <p class="small-copy" id="exam-minutes-note">Süresiz çözmek için boş bırak.</p>
            <div class="exam-numbers" role="group" aria-label="Hazır süreler">${examPresets.map(n=>examPreset('exam-minutes',n)).join('')}${examPreset('exam-minutes',0,'Süresiz')}</div>
          </div>
        </div>
        <p class="small-copy exam-policy">Süre dolduğunda deneme otomatik biter. Yanlışlar doğruları götürmez.</p>
        <button class="primary" id="exam-start" type="submit"${count?'':' disabled'}>Denemeyi başlat</button>
      </form>`;
  }
  function topicTable(byTopic){return `<div class="table-scroll"><table><thead><tr><th scope="col">${weekOrTopic}</th><th scope="col">Doğru</th><th scope="col">Yanlış</th><th scope="col">Boş</th><th scope="col">Başarı</th></tr></thead><tbody>${Object.entries(byTopic).map(([id,g])=>`<tr><td><a href="${practiceHref('lesson/'+id)}">${topics[id].name}</a></td><td>${g.correct}</td><td>${g.wrong}</td><td>${g.blank}</td><td>${Math.round(g.correct/g.total*100)}%<div class="bar-track"><div class="bar-fill" style="width:${g.correct/g.total*100}%"></div></div></td></tr>`).join('')}</tbody></table></div>`;}
  function result(){if(!run?.finished)return navigate(run?'run':'academy');const r=M.score(run,lookup),wrongs=run.ids.filter(id=>Object.hasOwn(run.answers,id)&&run.answers[id]!==lookup[id].correct);
    main.innerHTML=`<div class="result-heading"><div>${heading(courseTitle(),run.type==='exam'?'Deneme sonucu':'Çalışma sonucu',`${r.total} soruluk ${run.type==='exam'?'deneme':run.type==='reinforce'?'pekiştirme':'çalışma'} tamamlandı.`)}</div><div class="score-big">${r.percent}<small> / 100</small></div></div>`+
      stats([[r.correct,'Doğru'],[r.wrong,'Yanlış'],[r.blank,'Boş'],[time(r.time),'Toplam oturum süresi']])+`<div class="actions">${btn('Tüm cevapları incele','review','','secondary')}${wrongs.length?btn('Yanlışları yeniden çöz','run-wrongs'):''}<a href="${practiceHref('exam')}" class="secondary">Yeni deneme oluştur</a>${backLink('#home','Ana sayfaya dön')}</div>
      <section class="panel" style="margin-top:28px"><div class="section-head"><h2>${weekOrTopic} bazında sonuç</h2><span class="small-copy">Ortalama çözüm: ${time(r.average)}</span></div>${topicTable(r.byTopic)}</section>
      <section style="margin-top:28px"><div class="section-head"><h2>Bir sonraki adım</h2></div>${wrongs.length?`<p class="small-copy" style="margin-bottom:18px">Yanlış cevapladığın soruların açıklamalarını oku ve soruları yeniden çöz.</p><div class="bank-list">${wrongs.map(id=>card(lookup[id])).join('')}</div>`:r.blank?'<div class="notice">Boş bıraktığın soruları cevap incelemesinden açarak çalışabilirsin.</div>':'<div class="notice">Bu çalışmada bütün soruları doğru cevapladın. Başka bir konuyu çalışabilir veya daha kapsamlı deneme oluşturabilirsin.</div>'}</section>`;
  }
  function inspect(id){const q=lookup[id];if(!q)return navigate('bank');const r=state.records[id];const ans=r?{[id]:r.lastAnswer}:{};main.innerHTML=heading('SORU İNCELEMESİ',`Soru ${q.number}`,q.topicName)+question(q,ans,'İnceleme',true,true)+`<div class="actions" style="margin-top:20px">${btn('Yeniden çöz','single',id)}${backLink(practiceHref('wrong'),'Yanlışlarıma dön')}</div>`;}
  function analysis(){const records=D.questions.filter(q=>state.records[q.id]);
    if(!records.length&&!state.history.length){main.innerHTML=heading('BAŞARI ANALİZİ','İlerlemen, kendi cevaplarından.','Buradaki bilgiler gerçek çözüm kayıtlarından hesaplanır.')+`<div class="empty"><h3>Henüz analiz için çözüm yok</h3><p>Bir soru veya deneme çözdüğünde sonuçların burada görünecek.</p><a href="${practiceHref('bank')}" class="secondary">Çalışmaya başla</a></div>`;return;}
    const attempts=records.reduce((s,q)=>s+state.records[q.id].attempts,0),correct=records.reduce((s,q)=>s+state.records[q.id].correctCount,0),totalTime=records.reduce((s,q)=>s+state.records[q.id].totalTime,0);
    const timedAttempts=records.reduce((sum,q)=>sum+(state.records[q.id].timedAttempts??state.records[q.id].attempts),0);
    const timedLast=records.filter(q=>Number.isFinite(state.records[q.id].lastTime)).sort((a,b)=>state.records[b.id].lastTime-state.records[a.id].lastTime).slice(0,5);
    const byTopic={};records.forEach(q=>{const r=state.records[q.id],g=byTopic[q.topic]||(byTopic[q.topic]={total:0,correct:0,wrong:0,blank:0});g.total++;g[r.lastCorrect?'correct':'wrong']++;});
    const weak=Object.entries(byTopic).filter(([,g])=>g.wrong).sort((a,b)=>b[1].wrong/b[1].total-a[1].wrong/a[1].total);
    main.innerHTML=heading('BAŞARI ANALİZİ','Nerede ilerledin, nerede durmalısın?','Son cevapların ve tüm çözüm denemelerin ayrı hesaplanır.')+
      stats([[`${Math.round(correct/(attempts||1)*100)}%`,'Tüm denemelerde doğruluk'],[records.length,'Çözülen farklı ana soru'],[attempts,'Toplam çözüm denemesi'],[timedAttempts?time(totalTime/timedAttempts):'—','Ortalama çözüm süresi']])+
      `<section class="panel"><h3>${weekOrTopic} bazında son cevaplar</h3>${topicTable(byTopic)}</section><div class="home-bottom"><section class="panel"><h3>Çalışma önerileri</h3>${weak.length?weak.map(([id,g])=>`<div class="topic-row"><div><strong>${topics[id].name}</strong><p class="small-copy">${g.total} çözülmüş soruda ${g.wrong} son yanlış cevap. ${g.total<3?'Bu konu için veri henüz sınırlı.':''}</p></div><a class="text-button" href="${practiceHref('lesson/'+id)}">Öğren →</a></div>`).join(''):'<p class="small-copy">Çözdüğün soruların son cevaplarında yanlış yok. Henüz çözmediğin konuları inceleyebilirsin.</p>'}<div class="notice">Bu öneriler çözüm kayıtlarına dayanır; akademik yeterlilik teşhisi değildir.</div></section>
      <section class="panel"><h3>En uzun süren son çözümler</h3>${timedLast.length?timedLast.map(q=>`<div class="history-row"><span>${q.id} · ${q.topicName}</span><strong>${time(state.records[q.id].lastTime)}</strong></div>`).join(''):'<p class="small-copy">Henüz süresi ölçülen son çözüm yok.</p>'}</section></div>
      <section class="panel" style="margin-top:25px"><h3>Son çalışmalar</h3>${state.history.length?state.history.map((h,index)=>({h,index})).reverse().map(({h,index})=>`<div class="history-row"><span>${date(h.at)} · ${h.type==='exam'?'Deneme':h.type==='reinforce'?'Pekiştirme':'Sırayla çözüm'} · ${h.total} soru</span><strong>${h.correct} doğru · ${h.wrong} yanlış · ${h.blank} boş · %${h.percent}</strong>${Array.isArray(h.ids)&&h.answers?btn('İncele','view-history',String(index),'text-button'):''}${btn('Sil','remove-history',String(index),'text-button')}</div>`).join(''):'<p class="small-copy">Tek tek çözdüğün sorular analizde görünür. Çalışmayı bitirdiğinde oturum sonucu da bu listeye eklenir.</p>'}</section>`;
  }
  function historyDetail(id){
    const entry=state.history[Number(id)];
    if(!entry||!Array.isArray(entry.ids)||!entry.answers)return navigate('analysis');
    const rows=entry.ids.map((questionId,index)=>{
      const q=lookup[questionId],choice=entry.answers[questionId];
      if(!q)return `<div class="bank-item"><span class="number">${index+1}</span><div class="bank-content"><h3>Bu soru güncel soru listesinde bulunmuyor.</h3></div></div>`;
      const selected=Number.isInteger(choice)&&q.options[choice] ? `${letters[choice]} · ${rich(q.options[choice].text)}` : 'Boş bırakıldı';
      return `<div class="bank-item"><span class="number">${index+1}</span><div class="bank-content"><h3>${rich(q.stem)}</h3><p class="small-copy">Cevabın: ${selected}</p><p class="small-copy">Doğru cevap: ${letters[q.correct]} · ${rich(q.options[q.correct].text)}</p></div></div>`;
    }).join('');
    main.innerHTML=backLink(practiceHref('analysis'),'Başarı analizine dön')+heading('ÇALIŞMA GEÇMİŞİ','Cevapların',`${date(entry.at)} · ${entry.correct} doğru · ${entry.wrong} yanlış · ${entry.blank} boş`)+`<div class="bank-list">${rows}</div>`;
  }
  function settings(){main.innerHTML=heading('GİZLİLİK VE TERCİHLER','Çalışmanın kontrolü sende.','Uygulama öğrenci hesabı, kimlik bilgisi veya merkezi sonuç kaydı istemez.')+`<div class="settings"><section class="panel"><div class="setting-row"><div><h3>${rememberLabel}</h3><p>Etkinleştirirsen cevap kayıtların, yer imlerin, tüm çalışma sonuçların, devam eden çalışman ve tema tercihin yalnızca şu anda kullandığın cihaz ve tarayıcıda saklanır. Tarayıcı verilerini silersen kayıtlar kaybolabilir.</p></div><input class="toggle" id="remember" type="checkbox" aria-label="${rememberLabel}"${consent?' checked':''}></div>
    <div class="setting-row"><div><h3>${consent?'Bu cihazda saklama açık':'Yalnız bu oturumda çalışıyorsun'}</h3><p>Bu seçeneği kapatmak kalıcı kayıtları kaldırır; mevcut oturumdaki çalışman devam eder. Ortak cihazda yerel kayıtları başkaları görebilir. Uygulama diğer ziyaretçilere sonuçlarını göstermez.</p></div><span class="tag">${consent?'YEREL KAYIT':'OTURUM'}</span></div><div class="setting-row"><div><h3>Tema</h3><p>Okuma tercihine göre açık veya koyu temayı seç.</p></div>${btn(state.theme==='dark'?'Açık tema':'Koyu tema','theme','','secondary')}</div>
    <div class="setting-row"><div><h3>Kayıtları temizle</h3><p>Bu uygulamanın yerel kayıtları ve oturumdaki çözüm verileri silinir; yanlışlar, yer imleri ve sonuç geçmişi sıfırlanır.</p></div>${btn('Kayıtları temizle','clear','','secondary')}</div></section>
    <section class="lesson-section"><h2>Gizlilik bildirimi</h2><p>Uygulama cevaplarını, puanlarını veya yer imlerini herhangi bir merkezi API’ye göndermez. Uygulamada reklam, analiz pikseli, harici yazı tipi çağrısı ve canlı yapay zekâ bağlantısı yoktur. </p><p style="margin-top:14px">Barındırma hizmetinin erişim ve güvenlik günlükleri uygulamadan bağımsız olarak işlenebilir. Kaynak bağlantısına tıklarsan ilgili sitenin koşulları geçerli olur.</p><p style="margin-top:14px">Uygulamadaki soruların cevapları teknik olarak sayfa kaynaklarından incelenebilir. Deneme ekranı cevapları normal kullanımda sınav bitene kadar gizler; bu uygulama resmî veya gözetimli sınav güvenliği sunmaz.</p></section></div>`;}
  function finishNow(){M.finish(run,state,lookup);save();navigate('result');}
  function render(scroll=true){
    const hash=location.hash.slice(1)||'home';
    if(run?.type==='exam'&&!run.finished&&hash!==practicePath('run')){
      toast('Deneme sürüyor. Diğer ekranlar için önce denemeyi bitir.');
      navigate('run');
      return;
    }
    let next=hash,nextCourse=activeCourse;
    const [section,key,...parts]=hash.split('/');
    if(section==='ders'){
      if(hasCourseQuestions(key)&&practicePages.has(parts[0])){
        nextCourse=key;
        next=parts.join('/');
      }else next='sorular';
    }else if(section==='sorular'&&hasCourseQuestions(key)){
      nextCourse=key;
      next='academy';
    }else if(practicePages.has(section)){
      nextCourse=defaultCourse;
    }
    if(renderedHash!==hash){
      if(coursePicker.open)coursePicker.close();
      cardAnswers.clear();
      setCourseMenu(false);
      renderedHash=hash;
    }
    activateCourse(nextCourse);
    route=next;
    refreshChrome();
    const [page,id]=route.split('/');
    if(page==='home')home();
    else if(page==='sorular')chooseCourse(id);
    else if(page==='quick'){if(!D.questions.length)main.innerHTML=emptyContent('HIZLI ÇÖZÜM','Henüz soru eklenmedi','Yeni sorular eklendiğinde burada çözebilirsin.');else if(run&&!run.finished)navigate('run');else start('quick',D.questions.map(q=>q.id));}
    else if(page==='academy')academy();else if(page==='lesson')lesson(id);else if(page==='bank'||page==='about')bank();
    else if(page==='wrong'||page==='saved')collection(page);else if(page==='exam')exam();else if(page==='analysis')analysis();
    else if(page==='settings')settings();else if(page==='run'){if(run?.finished)navigate('result');else runView();}
    else if(page==='result')result();else if(page==='review'){if(run?.finished)runView(true);else navigate('run');}
    else if(page==='inspect')inspect(id);else if(page==='history')historyDetail(id);else home();
    if(scroll){window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
  }
  const actions={
    'switch-course':openCoursePicker,
    resume:()=>{
      if(!D.weekly)return navigate('run');
      const next=continuation();
      if(!next)return;
      if(next.ids)return start('quick',next.ids);
      run.index=next.index;
      run.tickAt=Date.now();
      navigate('run');
    },
    single:id=>start('quick',[id]),'topic-quick':id=>start('quick',D.questions.filter(q=>q.topic===id).map(q=>q.id)),
    reinforce:id=>start('reinforce',D.reinforcement.filter(q=>q.topic===id).map(q=>q.id)),
    filtered:()=>start('quick',filtered().map(q=>q.id)),
    'clear-bank-weeks':()=>{
      bankWeeks.clear();
      bank();
      document.getElementById('bank-week-toggle').focus();
    },
    'clear-exam-weeks':()=>{
      examWeeks.clear();
      exam();
      document.getElementById('exam-week-toggle').focus();
    },
    'retry-wrongs':()=>start('quick',wrongIds()),'retry-saved':()=>start('quick',state.bookmarks),
    bookmark:id=>{state.bookmarks=state.bookmarks.includes(id)?state.bookmarks.filter(x=>x!==id):[...state.bookmarks,id];save();render(false);toast(state.bookmarks.includes(id)?'Soru tekrar defterine kaydedildi.':'Yer imi kaldırıldı.');},
    level:id=>{lessonLevel=Number(id);lesson(route.split('/')[1]);},
    learn:id=>{teacherContext=id;lessonLevel=1;navigate('lesson/'+lookup[id].topic);},
    inspect:id=>navigate('inspect/'+id),
    'answer-card':(value,target)=>{
      const [id,option]=value.split('/');
      const q=lookup[id],choice=Number(option),item=target.closest('.bank-item');
      if(!item||!q?.options[choice]||cardAnswers.has(id))return;
      cardAnswers.set(id,choice);
      M.record(state,q,choice);
      save();
      item.innerHTML=cardContents(q);
      item.querySelector('.feedback').focus();
    },
    'retry-card':(id,target)=>{
      const item=target.closest('.bank-item');
      if(!item||!cardAnswers.delete(id))return;
      item.innerHTML=cardContents(lookup[id]);
      item.querySelector('.option').focus();
    },
    answer:id=>{
      if(!run||run.finished||route!=='run')return;
      M.tick(run);
      const q=lookup[run.ids[run.index]],choice=Number(id);
      const previous=run.answers[q.id];
      const changed=M.answer(run,q,choice);
      const showFeedback=changed&&run.type!=='exam';
      if(showFeedback&&previous!==choice){
        const token=String(run.startedAt)+'/'+q.id;
        run.recordBaselines ||= {};
        if(previous===undefined||state.records[q.id]?.runAnswerToken!==token){
          run.recordBaselines[q.id]=state.records[q.id]?{...state.records[q.id]}:null;
        } else if(run.recordBaselines[q.id])state.records[q.id]={...run.recordBaselines[q.id]};
        else delete state.records[q.id];
        M.record(state,q,choice,run.times[q.id]||0);
        state.records[q.id].runAnswerToken=token;
      }
      if(changed)save();
      runView();
      if(showFeedback)document.getElementById('run-answer-feedback')?.focus();
    },
    'clear-answer':()=>{
      if(!run||run.finished||route!=='run')return;
      const id=run.ids[run.index];
      if(!Object.hasOwn(run.answers,id))return;
      if(run.type!=='exam'){
        const token=String(run.startedAt)+'/'+id;
        if(state.records[id]?.runAnswerToken===token){
          if(run.recordBaselines?.[id])state.records[id]={...run.recordBaselines[id]};
          else delete state.records[id];
        }
        if(run.recordBaselines)delete run.recordBaselines[id];
      }
      delete run.answers[id];save();runView();
      toast('Cevap kaldırıldı. İstersen yeniden seçebilirsin.');
    },
    next:()=>move(Math.min(run.ids.length-1,run.index+1)),previous:()=>move(Math.max(0,run.index-1)),jump:id=>move(Number(id)),
    flag:()=>{const id=run.ids[run.index];run.flags=run.flags.includes(id)?run.flags.filter(x=>x!==id):[...run.flags,id];save();runView();},
    finish:()=>{if(!run||run.finished)return;const blank=run.ids.length-Object.keys(run.answers).length;confirm('Çalışmayı bitir?',blank?`${blank} soruyu boş bıraktın. Mevcut cevaplarınla sonuç hesaplanacak.`:'Cevapların değerlendirilecek ve sonuç ekranı açılacak.',finishNow);},
    result:()=>navigate('result'),review:()=>{run.index=0;navigate('review');},
    'run-wrongs':()=>{const ids=run.ids.filter(id=>Object.hasOwn(run.answers,id)&&run.answers[id]!==lookup[id].correct);start(run.type==='reinforce'?'reinforce':'quick',ids);},
    'view-history':id=>navigate('history/'+id),
    'remove-history':id=>{
      const index=Number(id);
      if(!Number.isInteger(index)||index<0||index>=state.history.length)return;
      confirm('Bu çalışma sonucunu sil?', 'Yalnızca seçtiğin sonuç geçmişten silinir. Cevap kayıtların ve diğer sonuçların korunur.',()=>{
        state.history.splice(index,1);save();analysis();toast('Çalışma sonucu silindi.');
      });
    },
    'exam-count':id=>{
      examConfig.count=Number(id);
      document.getElementById('exam-count').value=id;
    },
    'exam-minutes':id=>{
      examConfig.minutes=Number(id);
      document.getElementById('exam-minutes').value=examConfig.minutes?id:'';
    },
    'start-exam':()=>{
      const pool=examPool(),{count,minutes}=examConfig;
      if(!Number.isSafeInteger(count)||count<1||count>pool.length)return toast(`Soru sayısı 1 ile ${pool.length} arasında olmalı.`);
      if(!Number.isSafeInteger(minutes)||minutes<0||!Number.isSafeInteger(Date.now()+minutes*60000))return toast('Süreyi dakika olarak tam sayı gir.');
      start('exam',M.shuffle(pool).slice(0,count).map(q=>q.id),minutes);
    },
    'dismiss-guide':(id,target)=>{
      dismissedGuides.add(id);
      target.closest('.section-guide').remove();
      main.focus({preventScroll:true});
    },
    'hide-guide':(id,target)=>{
      hiddenGuides.add(id);
      actions['dismiss-guide'](id,target);
      try{storage.setItem(guideKey,JSON.stringify([...hiddenGuides]));}
      catch{toast('Bu açıklama yalnızca bu oturumda gizlendi.');}
    },
    theme:()=>{theme=theme==='dark'?'light':'dark';save(true);if(route==='settings')settings();},
    clear:()=>confirm('Tüm çalışma kayıtlarını temizle?','Tüm derslerdeki cevapların, yer imlerin ve sonuç geçmişin bu oturumdan ve bu tarayıcıdan kaldırılacak.',()=>{
      courseProgress.clear();
      courseRuns.clear();
      cardAnswers.clear();
      state=M.empty(D.version);
      courseProgress.set(activeCourse,state);
      theme=state.theme;
      consent=false;
      run=null;
      save(true);
      render(false);
      toast('Çalışma kayıtları temizlendi.');
    })
  };
  function move(index){if(!run||index<0||index>=run.ids.length)return;M.tick(run);run.index=index;save();runView(route==='review');window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
  document.getElementById('site-header').addEventListener('click',e=>{
    if(!e.target.closest('a[href="./dersler/"]')||run?.type!=='exam'||run.finished)return;
    e.preventDefault();
    toast('Deneme sürüyor. Diğer ekranlar için önce denemeyi bitir.');
  });
  menuToggle.addEventListener('click',()=>setCourseMenu(!menuOpen));
  coursePicker.addEventListener('click',e=>{
    if(e.target.closest('a[href]')&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey)coursePicker.close();
  });
  courseSidebar.addEventListener('click',e=>{
    if(menuOpen&&e.target.closest('#course-menu a')&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){
      setCourseMenu(false,menuToggle.getClientRects().length>0);
    }
  });
  courseSidebar.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!menuOpen||!menuToggle.getClientRects().length)return;
    e.preventDefault();
    setCourseMenu(false,true);
  });
  document.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(!target||target.disabled)return;const fn=actions[target.dataset.action];if(fn)fn(target.dataset.id,target);});
  function readExamInput(el){
    if(el.id==='exam-count')examConfig.count=el.value===''?'':Number(el.value);
    else if(el.id==='exam-minutes')examConfig.minutes=Number(el.value);
  }
  document.addEventListener('input',e=>readExamInput(e.target));
  document.addEventListener('change',e=>{
    const el=e.target;
    if(el.id==='bank-status'){
      bankStatus=el.value;
      bankResults();
    }else if(el.name==='bank-week'){
      changeWeek('bank',bankWeeks,el);
      bankResults();
    }else if(el.name==='exam-week'){
      changeWeek('exam',examWeeks,el);
      updateExamCountLimit();
    }else if(el.id==='exam-topic'){
      examConfig.topic=el.value;
      if(examConfig.count>examPool().length)examConfig.count=examPool().length;
      exam();
      document.getElementById('exam-topic').focus();
    }else if(el.id==='remember'){
      if(consent&&!el.checked)for(const id of Object.keys(datasets))loadCourseProgress(id);
      consent=el.checked;
      const saved=save(true);
      el.checked=consent;
      if(route==='settings'){
        settings();
        document.getElementById('remember').focus();
      }
      if(saved)toast(consent?'İlerlemen bu cihazda ve tarayıcıda kaydedilecek.':'Kalıcı kayıt kapatıldı. Çalışman bu oturumda devam ediyor.');
    }else readExamInput(el);
  });
  document.addEventListener('submit',e=>{
    if(e.target.id!=='exam-form')return;
    e.preventDefault();
    readExamInput(document.getElementById('exam-count'));
    readExamInput(document.getElementById('exam-minutes'));
    actions['start-exam']();
  });
  document.getElementById('theme').addEventListener('click',actions.theme);
  document.getElementById('confirm-cancel').addEventListener('click',()=>{document.getElementById('confirm-dialog').close();confirmAction=null;});
  document.getElementById('confirm-ok').addEventListener('click',()=>{document.getElementById('confirm-dialog').close();const fn=confirmAction;confirmAction=null;if(fn)fn();});
  document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||coursePicker.open||document.getElementById('confirm-dialog').open)return;if(route==='run'&&run&&!run.finished&&/^[1-5]$/.test(e.key)){e.preventDefault();actions.answer(String(Number(e.key)-1));}});
  window.addEventListener('hashchange',()=>render());
  window.addEventListener('pagehide',()=>{if(run&&!run.finished&&route==='run'&&!document.hidden)M.tick(run);save();});
  setInterval(()=>{if(!run||run.finished)return;if(run.type==='exam'||(route==='run'&&!document.hidden))M.tick(run);else run.tickAt=Date.now();if(run.deadline&&Date.now()>=run.deadline){document.getElementById('confirm-dialog').close();confirmAction=null;finishNow();toast('Süre doldu. Deneme mevcut cevaplarınla tamamlandı.');return;}const el=document.getElementById('run-timer');if(el)el.textContent=clock();},1000);
  render();
  // QA hook exposes existing in-memory actions only, no personal identity or network access.
  window.MuskamApp={actions,render,getState:()=>state,getRun:()=>run,getConsent:()=>consent};
})();
