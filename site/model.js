(function(root){
  'use strict';
  const normalize=s=>String(s).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
  const empty=version=>({version,records:{},bookmarks:[],history:[],theme:'light'});
  function createRun(type,ids,now=Date.now(),minutes=0){
    return {type,ids:[...ids],index:0,answers:{},times:{},flags:[],startedAt:now,tickAt:now,
      elapsed:0,deadline:minutes?now+minutes*60000:null,finished:false,recorded:false};
  }
  function tick(run,now=Date.now()){
    if(!run||run.finished)return;
    const endpoint=run.deadline?Math.min(now,run.deadline):now;
    const seconds=Math.max(0,(endpoint-run.tickAt)/1000);
    const id=run.ids[run.index];
    if(run.type==='exam'||!Object.hasOwn(run.answers,id))run.times[id]=(run.times[id]||0)+seconds;
    run.elapsed+=seconds;run.tickAt=endpoint;
  }
  function answer(run,q,choice){
    if(run.finished||!q||!run.ids.includes(q.id)||!validChoice(q,choice))return false;
    const {id}=q;
    run.answers[id]=choice;return true;
  }
  function score(run,lookup){
    let correct=0,wrong=0,blank=0;const byTopic={};
    run.ids.forEach(id=>{const q=lookup[id];if(!q)throw new Error('Unknown question');
      const group=byTopic[q.topic]||(byTopic[q.topic]={total:0,correct:0,wrong:0,blank:0,time:0});group.total++;
      group.time+=run.times[id]||0;
      if(!Object.hasOwn(run.answers,id)){blank++;group.blank++;}
      else if(run.answers[id]===q.correct){correct++;group.correct++;}
      else{wrong++;group.wrong++;}
    });
    return {total:run.ids.length,correct,wrong,blank,percent:run.ids.length?Math.round(correct/run.ids.length*100):0,
      time:run.elapsed,average:run.ids.length?Object.values(run.times).reduce((a,b)=>a+b,0)/run.ids.length:0,byTopic};
  }
  function validChoice(q,choice){return Number.isInteger(choice)&&choice>=0&&choice<q.options.length;}
  function record(state,q,choice,seconds,now=Date.now()){
    if(!q||!validChoice(q,choice))return;
    const ok=choice===q.correct;
    const prev=state.records[q.id]||{attempts:0,correctCount:0,wrongCount:0,totalTime:0};
    const measured=Number.isFinite(seconds);
    const duration=measured?Math.max(0,seconds):null;
    state.records[q.id]={...prev,attempts:prev.attempts+1,correctCount:prev.correctCount+(ok?1:0),
      wrongCount:prev.wrongCount+(ok?0:1),lastAnswer:choice,lastCorrect:ok,lastAt:now,
      totalTime:prev.totalTime+(duration??0),lastTime:duration,
      timedAttempts:(prev.timedAttempts??prev.attempts)+Number(measured)};
  }
  function finish(run,state,lookup,now=Date.now()){
    if(run.finished)return score(run,lookup);
    tick(run,now);run.finished=true;
    if(run.type==='exam')for(const id of run.ids){if(Object.hasOwn(run.answers,id))record(state,lookup[id],run.answers[id],run.times[id]||0,now);}
    const result=score(run,lookup);
    state.history.push({at:now,type:run.type,...result,ids:[...run.ids],answers:{...run.answers},flags:[...run.flags],times:{...run.times}});run.recorded=true;
    return result;
  }
  function filter(items,state,{search='',topic='',difficulty='',status=''}={}){
    const query=normalize(search);
    return items.filter(q=>(!topic||q.topic===topic)&&(!difficulty||q.difficulty===difficulty)&&
      (!query||normalize(q.stem+' '+q.topicName).includes(query))&&
      (!status||(status==='new'&&!state.records[q.id])||
       (status==='wrong'&&state.records[q.id]?.lastCorrect===false)||
       (status==='saved'&&state.bookmarks.includes(q.id))));
  }
  function shuffle(items,rng=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function load(storage,version,progressKey='muskam-progress'){
    try{if(storage.getItem('muskam-consent')!=='yes')return {state:empty(version),consent:false};
      const parsed=JSON.parse(storage.getItem(progressKey)||'null');
      const state=empty(version);
      state.theme=parsed?.theme==='dark'?'dark':'light';
      if(!parsed||typeof parsed!=='object')return {state,consent:true};
      if(parsed.records&&typeof parsed.records==='object'&&!Array.isArray(parsed.records))state.records=parsed.records;
      if(Array.isArray(parsed.bookmarks))state.bookmarks=parsed.bookmarks.filter(x=>typeof x==='string');
      if(Array.isArray(parsed.history))state.history=parsed.history;
      if(parsed.activeRun&&typeof parsed.activeRun==='object'&&!Array.isArray(parsed.activeRun))state.activeRun=parsed.activeRun;
      if(['run','list'].includes(parsed.studyPosition?.kind)&&typeof parsed.studyPosition.id==='string')state.studyPosition={kind:parsed.studyPosition.kind,id:parsed.studyPosition.id};
      return {state,consent:true};
    }catch{return {state:empty(version),consent:false};}
  }
  function persist(storage,state,consent,progressKey='muskam-progress'){
    try{if(consent){storage.setItem(progressKey,JSON.stringify(state));storage.setItem('muskam-consent','yes');}
      else{storage.removeItem(progressKey);storage.removeItem('muskam-consent');}return true;
    }catch{return false;}
  }
  const api={normalize,empty,createRun,tick,answer,score,record,finish,filter,shuffle,load,persist};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MuskamModel=api;
})(typeof window!=='undefined'?window:globalThis);
