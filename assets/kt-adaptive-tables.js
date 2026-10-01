/* DW adaptive-table behavior extracted for opt-in KT source tables only. */
(() => {
 'use strict';
 document.querySelectorAll('main.content .kt-adaptive-records table.table').forEach(table=>{
  if(table.dataset.ktAdaptive)return;
  const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent.replace(/\s+/g,' ').trim()),wrap=table.closest('.kt-adaptive-records');
  if(heads.length<2||!wrap)return;
  table.dataset.ktAdaptive='true';table.setAttribute('role','table');
  table.tHead?.setAttribute('role','rowgroup');table.tBodies[0]?.setAttribute('role','rowgroup');
  [...table.rows].forEach(row=>{row.setAttribute('role','row');[...row.cells].forEach(cell=>cell.setAttribute('role',cell.tagName==='TH'?'columnheader':'cell'));});
  [...table.tBodies[0].rows].forEach(row=>[...row.cells].forEach((cell,index)=>{
   const label=document.createElement('span');label.className='kt-record-label';label.textContent=heads[index];label.setAttribute('aria-hidden','true');cell.prepend(label);
   if(document.getElementById('equipment-quick-find')&&['类别','Equipment 类别','Category','Equipment category'].includes(heads[index]))cell.classList.add('kt-record-category');
   if(document.getElementById('equipment-quick-find')&&['详情','Detail'].includes(heads[index]))cell.classList.add('kt-record-detail');
   if(document.getElementById('dressing-room-unlocks')&&['具体条件','Details'].includes(heads[index]))cell.classList.add('kt-record-detail');
   if(wrap.classList.contains('kt-travel-schedule')&&['时间','Cost'].includes(heads[index]))cell.classList.add('kt-record-cost');
  }));
  const update=()=>{
   const narrow=wrap.getBoundingClientRect().width<576;
   if(wrap.classList.contains('kt-record-mode')!==narrow)wrap.classList.toggle('kt-record-mode',narrow);
  };
  // A mode switch changes height; defer observer writes to avoid resize loops.
  let frame=0;
  new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});}).observe(wrap);
  update();
 });
 // The record switch changes content above Equipment's existing destinations.
 // Complete that first layout before restoring an initial Search / deep link.
 if(document.getElementById('equipment-quick-find') && location.hash){
  const initialHash=location.hash;let interacted=false;
  const inputs=['wheel','touchstart','pointerdown','keydown'];
  const mark=()=>{interacted=true;};inputs.forEach(t=>addEventListener(t,mark,{passive:true}));
  const land=async()=>{
   await document.fonts.ready;
   for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
   inputs.forEach(t=>removeEventListener(t,mark));
   if(interacted||location.hash!==initialHash)return;
   let id;try{id=decodeURIComponent(initialHash.slice(1));}catch{return;}
   const target=document.getElementById(id);if(!target)return;
   const top=target.getBoundingClientRect().top;
   // Quarto sections include a header-offset pseudo element; bare anchors do not.
   // Keep the readable heading below the header in either case, with integer
   // scroll positioning so subpixel rounding cannot clip the target above zero.
   const heading=target.matches('section')?target.querySelector(':scope > :is(h1,h2,h3,h4)'):null;
   const inset=heading?heading.getBoundingClientRect().top-top:0;
   const header=document.getElementById('quarto-header')?.getBoundingClientRect().bottom||0;
   const clearance=Math.max(1,header+12-inset);
   scrollTo({top:Math.floor(scrollY+top-clearance),behavior:'instant'});
  };
  if(document.readyState==='complete')land();else addEventListener('load',land,{once:true});
 }
})();
