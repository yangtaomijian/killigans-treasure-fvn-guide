/* Progressive master/detail reference. Native identity and shared generated text. */
(() => {
 'use strict';
 const host=document.querySelector('[data-kt-dressing-room]');if(!host)return;
 const loc=document.documentElement.lang.startsWith('en')?'en':'zh',en=loc==='en';
 const words=en?{group:'Group / region',character:'Character',pick:'Select an Outfit value to see its unlock reference.',empty:'This character has no switchable Outfit category in this release. Expressions use viewed history; see the reference below.',copy:'Copy entry link',copied:'Copied',failed:'Copy this URL',options:'Outfit values',availability:'Menu availability: ',setting:'Adult-content setting applies.'}:{group:'地区 / 团体',character:'人物',pick:'选择服装编号，查看取得方式。',empty:'本版本此人物没有可切换的服装部位。表情按观看历史开放，见下方说明。',copy:'复制此条目链接',copied:'已复制',failed:'复制此网址',options:'服装编号',availability:'入口开放：',setting:'此类受成人内容设置影响。'};
 const controls=host.querySelector('.kt-dressing-controls'),detail=host.querySelector('.kt-dressing-detail'),catalog=host.querySelector('.kt-dressing-catalog');
 const entries=new Map([...catalog.querySelectorAll('.kt-dressing-entry')].map(n=>[n.id,n]));
 const mobile=matchMedia('(max-width:899px)');
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let data,chars,items,selected=null,lastURL='';
 function headerOffset(){host.style.setProperty('--kt-dressing-top',`${(document.getElementById('quarto-header')?.getBoundingClientRect().height||68)+16}px`);}
 function mountDetail(){
  const item=items?.get(selected),category=item&&controls.querySelector(`[data-dress-category-section="${item.category}"]`);
  if(mobile.matches&&category)category.append(detail);else controls.after(detail);
 }
 function restoreScroll(pos){scrollTo({left:pos[0],top:pos[1],behavior:'instant'});}
 function navigate(character,anchor,external=false){
  const pos=[scrollX,scrollY],u=new URL(location.href),focus=document.activeElement;
  const focusId=focus?.dataset.tabId,focusTarget=focus?.dataset.dressTarget;
  u.searchParams.set('character',character);u.hash=anchor||'';
  if(u.href!==location.href){
   history.replaceState({...history.state,ktDressingScroll:pos},'');
   history.pushState({...history.state,ktDressingScroll:external?null:pos},'',u);
  }
  sync();window.dispatchEvent(new Event('kt:dressing-navigation'));
  if(external)landing();else{
   if(focusId)host.querySelector(`[data-tab-id="${focusId}"]`)?.focus({preventScroll:true});
   if(focusTarget)host.querySelector(`[data-dress-target="${focusTarget}"]`)?.focus({preventScroll:true});
   restoreScroll(pos);
  }
 }
 function tabs(label,values,active,action){
  const wrap=el('div','kt-dressing-tab-section'),title=el('p','kt-dressing-label',label),list=el('div','kt-dressing-tabs');
  list.setAttribute('role','tablist');list.setAttribute('aria-label',label);
  values.forEach(v=>{const b=el('button','kt-dressing-tab',v.name);b.type='button';b.dataset.tabId=v.id;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(v.id===active));b.tabIndex=v.id===active?0:-1;b.addEventListener('click',()=>action(v.id));list.append(b);});
  list.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...list.children],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length,id=buttons[next].dataset.tabId;action(id);host.querySelector(`[data-tab-id="${id}"]`)?.focus({preventScroll:true});});
  wrap.append(title,list);return wrap;
 }
 function paint(character,anchor){
  if(selected)catalog.append(entries.get(selected));selected=null;
  controls.after(detail);detail.replaceChildren();detail.scrollTop=0;
  const c=chars.get(character);controls.replaceChildren();
  controls.append(tabs(words.group,data.groups,c.group,id=>navigate(data.characters.find(x=>x.group===id).id,null)),tabs(words.character,data.characters.filter(x=>x.group===c.group),c.id,id=>navigate(id,null)));
  controls.append(el('h3','kt-dressing-character-title',c.name),el('p','kt-dressing-availability',words.availability+c.available[loc]));
  const ci=data.items.filter(x=>x.character===c.id),categories=data.categories.filter(x=>ci.some(i=>i.category===x.id));
  if(!ci.length)controls.append(el('p','kt-dressing-empty',words.empty));
  const grid=el('div','kt-dressing-categories');
  categories.forEach(k=>{
   const section=el('section','kt-dressing-category');section.dataset.dressCategorySection=k.id;section.append(el('h4','',k.label[loc]));
   if(ci.some(x=>x.category===k.id&&x.setting))section.append(el('p','kt-dressing-setting',words.setting));
   const values=el('div','kt-dressing-values');values.setAttribute('aria-label',`${c.name} · ${k.nativeName} · ${words.options}`);
   ci.filter(x=>x.category===k.id).forEach(i=>{const a=el('a','kt-dressing-value',i.visibleValue);a.href=`?character=${i.character}#${i.anchor}`;a.dataset.dressTarget=i.anchor;a.setAttribute('aria-label',`${c.name} · ${k.nativeName} · ${i.visibleValue}`);
    if(anchor===i.anchor){a.setAttribute('aria-current','true');a.classList.add('is-selected');}
    a.addEventListener('click',e=>{if(e.button||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;e.preventDefault();navigate(i.character,i.anchor);});values.append(a);});
   section.append(values);grid.append(section);
  });controls.append(grid);detail.hidden=!ci.length;
  if(anchor&&entries.has(anchor)){
   selected=anchor;detail.append(entries.get(anchor));
   const share=el('button','kt-dressing-copy',words.copy);share.type='button';
   share.addEventListener('click',async()=>{
    const u=new URL(location.href);u.search='';u.searchParams.set('character',character);u.hash=anchor;
    try{await navigator.clipboard.writeText(u.href);if(share.isConnected){share.textContent=words.copied;setTimeout(()=>{if(share.isConnected)share.textContent=words.copy;},1800);}}
    catch{if(!share.isConnected)return;const input=el('input','kt-dressing-copy-url');input.value=u.href;input.readOnly=true;input.setAttribute('aria-label',words.failed);share.after(input);input.focus({preventScroll:true});input.select();}
   });detail.append(share);
  }else if(ci.length)detail.append(el('p','kt-dressing-prompt',words.pick));
  mountDetail();window.dispatchEvent(new Event('kt:dressing-selection'));
 }
 function sync(){
  const u=new URL(location.href),anchor=decodeURIComponent(u.hash.slice(1)),item=items.get(anchor),c=item?.character||(chars.has(u.searchParams.get('character'))?u.searchParams.get('character'):data.characters[0].id);
  paint(c,item?anchor:null);
  if(item&&u.searchParams.get('character')!==c){u.searchParams.set('character',c);history.replaceState(history.state,'',u);window.dispatchEvent(new Event('kt:dressing-navigation'));}
  lastURL=location.href;
 }
 function landing(){
  const fragment=decodeURIComponent(location.hash.slice(1)),item=items?.get(fragment);
  if(!item){
   // The async catalog collapse changes native section-fragment positions.
   const target=fragment&&document.getElementById(fragment);
   if(target&&!host.contains(target))requestAnimationFrame(()=>requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'instant'})));
   return;
  }
  requestAnimationFrame(()=>{const category=controls.querySelector(`[data-dress-category-section="${item.category}"]`);category.scrollIntoView({block:'start',behavior:'instant'});detail.scrollTop=0;detail.querySelector('h3')?.focus({preventScroll:true});});
 }
 fetch(host.dataset.source).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(value=>{
  data=value;chars=new Map(data.characters.map(x=>[x.id,x]));items=new Map(data.items.map(x=>[x.anchor,x]));
  if(items.size!==entries.size||[...items.keys()].some(id=>!entries.has(id)))throw Error('Dressing Room identity mismatch');
  controls.hidden=false;catalog.hidden=true;host.classList.add('is-enhanced');headerOffset();sync();
  window.addEventListener('popstate',()=>{sync();const pos=history.state?.ktDressingScroll;if(pos){requestAnimationFrame(()=>restoreScroll(pos));host.querySelector(`[data-dress-target="${selected}"]`)?.focus({preventScroll:true});}else landing();window.dispatchEvent(new Event('kt:dressing-navigation'));});
  window.addEventListener('hashchange',()=>{if(location.href===lastURL){const pos=history.state?.ktDressingScroll;if(pos)requestAnimationFrame(()=>restoreScroll(pos));return;}sync();landing();});
  mobile.addEventListener('change',()=>{const pos=[scrollX,scrollY];mountDetail();headerOffset();restoreScroll(pos);});window.addEventListener('resize',headerOffset);
  document.addEventListener('click',e=>{if(e.defaultPrevented)return;const a=e.target.closest('a[href]');if(!a||host.contains(a)||e.button||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;const u=new URL(a.href,location.href);if(u.pathname!==location.pathname||!items.has(u.hash.slice(1)))return;e.preventDefault();const i=items.get(u.hash.slice(1));navigate(i.character,i.anchor,true);});
  if(document.fonts?.ready)document.fonts.ready.then(landing);else landing();
 }).catch(()=>{controls.hidden=true;detail.hidden=true;catalog.hidden=false;host.classList.remove('is-enhanced');});
})();
