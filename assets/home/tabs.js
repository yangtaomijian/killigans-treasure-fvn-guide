(() => {
 const book=document.querySelector('#kt-reading'), nav=book?.querySelector('.v10-tabs');
 if(!nav) return;
 const tabs=[...nav.querySelectorAll('a')], panels=[...book.querySelectorAll('.kt-home-entry')];
 if(tabs.length!==panels.length) return;
 const locale=document.body.dataset.homeLocale==='en'?'en':'zh';
 const key='kt-codex-category:'+locale, resetKey='kt-codex-reset:'+locale;
 const read=k=>{try{return sessionStorage.getItem(k)}catch{return null}};
 const write=(k,v)=>{try{sessionStorage.setItem(k,v)}catch{}};
 function save(i){write(key,String(i));try{history.replaceState({...history.state,ktCodex:{locale,index:i}},'')}catch{}}
 document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');if(!a)return;
  let u;try{u=new URL(a.href)}catch{return}
  if(u.origin!==location.origin)return;
  const target=u.pathname.startsWith('/en/')?'en':'zh';
  if(target!==locale)write('kt-codex-reset:'+target,'1');
 });
 nav.setAttribute('role','tablist');nav.setAttribute('aria-orientation','vertical');
 function select(i, focus=false){
  tabs.forEach((tab,n)=>{tab.setAttribute('aria-selected',String(n===i));tab.tabIndex=n===i?0:-1;panels[n].hidden=n!==i;});
  save(i);
  if(focus) tabs[i].focus({preventScroll:true});
 }
 tabs.forEach((tab,i)=>{
  tab.id='codex-tab-'+i;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panels[i].id);
  panels[i].setAttribute('role','tabpanel');panels[i].setAttribute('aria-labelledby',tab.id);panels[i].tabIndex=0;
  tab.addEventListener('click',e=>{e.preventDefault();select(i);});
  tab.addEventListener('keydown',e=>{
   let n=i;
   if(['ArrowDown','ArrowRight'].includes(e.key))n=(i+1)%tabs.length;
   else if(['ArrowUp','ArrowLeft'].includes(e.key))n=(i+tabs.length-1)%tabs.length;
   else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;
   else if(e.key===' '||e.key==='Enter'){e.preventDefault();select(i);return;}else return;
   e.preventDefault();select(n,true);
  });
 });
 function hashSelect(){let hash;try{hash=decodeURIComponent(location.hash.slice(1))}catch{return;}let i=panels.findIndex(p=>p.id===hash);if(i>=0)select(i);}
 book.classList.add('v9-tabs');
 let reset=read(resetKey)==='1';try{sessionStorage.removeItem(resetKey)}catch{}
 let saved=history.state?.ktCodex;
 let initial=reset?0:(saved?.locale===locale?saved.index:Number(read(key)||0));
 if(!Number.isInteger(initial)||initial<0||initial>=tabs.length)initial=0;
 select(initial);if(!reset)hashSelect();
 window.addEventListener('pageshow',()=>{const state=history.state?.ktCodex;if(state?.locale===locale&&Number.isInteger(state.index)&&state.index>=0&&state.index<tabs.length)select(state.index)});window.addEventListener('hashchange',hashSelect);
 const small=matchMedia('(max-width:767px)');function orientation(){nav.setAttribute('aria-orientation','horizontal')}orientation();small.addEventListener('change',orientation);
})();
