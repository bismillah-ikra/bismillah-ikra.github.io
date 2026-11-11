(function(){
  'use strict';
  const key='paylasim-theme';
  let current='light';
  try {
    const saved=localStorage.getItem(key);
    if(saved==='dark'||saved==='light')current=saved;
    else if(localStorage.getItem('muskam-consent')==='yes'){
      const progress=JSON.parse(localStorage.getItem('muskam-progress')||'null');
      if(progress?.theme==='dark')current='dark';
    }
  } catch {}
  function apply(value){current=value==='dark'?'dark':'light';document.documentElement.dataset.theme=current;}
  apply(current);
  window.SiteTheme={get:()=>current,set(value){apply(value);try{localStorage.setItem(key,current);}catch{}},key};
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue);});
})();
