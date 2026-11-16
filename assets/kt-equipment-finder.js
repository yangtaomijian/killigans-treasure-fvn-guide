(()=>{'use strict';const en=document.documentElement.lang.startsWith('en'), tables=[...document.querySelectorAll('.kt-equipment-completion')];if(tables.length!==5)return;
const regions=['redroot','wilds','aris','spiceport','blueleaf'], names=['Redroot','Redroot Wilds','Aris','Spiceport','Blueleaf Grove'];
const itemMeta=/* ITEM_META_START */{
  "equipment-item-silvatto-vest": {
    "region": "redroot",
    "ways": [
      "gift"
    ]
  },
  "equipment-item-silvatto-anklets": {
    "region": "redroot",
    "ways": [
      "gift"
    ]
  },
  "equipment-item-silvatto-loinwrap": {
    "region": "redroot",
    "ways": [
      "gift"
    ]
  },
  "equipment-item-marchanide-langou": {
    "region": "wilds",
    "ways": [
      "branch",
      "story"
    ]
  },
  "equipment-item-spare-langou": {
    "region": "aris",
    "ways": [
      "gift",
      "branch"
    ]
  },
  "equipment-item-viscount-robe": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-fiendish-harness": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-hand-me-down-loincloth": {
    "region": "aris",
    "ways": [
      "gift",
      "branch",
      "shop"
    ]
  },
  "equipment-item-viscount-kilt": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-fiendish-garb": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-aris-langou": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-woven-britches": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-viscount-loinwrap": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-viscount-belt": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-fiendish-belt": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-viscount-anklets": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-fiendish-greaves": {
    "region": "aris",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-prime-attire": {
    "region": "aris",
    "ways": [
      "reward"
    ]
  },
  "equipment-item-peddler-s-vest": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-scallywag-covering": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-old-fashioned-vest": {
    "region": "spiceport",
    "ways": [
      "backroom"
    ]
  },
  "equipment-item-peddler-s-belt": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-old-fashioned-suspenders": {
    "region": "spiceport",
    "ways": [
      "backroom"
    ]
  },
  "equipment-item-peddler-s-shoes": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-scallywag-scraps": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-custom-made-sandals": {
    "region": "spiceport",
    "ways": [
      "backroom"
    ]
  },
  "equipment-item-peddler-s-leggings": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-scallywag-pantsleeve": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-old-fashioned-loinwear": {
    "region": "spiceport",
    "ways": [
      "backroom"
    ]
  },
  "equipment-item-peddler-s-confidence": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-scallywag-bandana": {
    "region": "spiceport",
    "ways": [
      "shop"
    ]
  },
  "equipment-item-old-fashioned-langou": {
    "region": "spiceport",
    "ways": [
      "backroom"
    ]
  },
  "equipment-item-focusing-wriststrap": {
    "region": "blueleaf",
    "ways": [
      "gift",
      "branch"
    ]
  },
  "equipment-item-brawler-band": {
    "region": "blueleaf",
    "ways": [
      "gift",
      "branch"
    ]
  },
  "equipment-item-marchanide-timekeeper": {
    "region": "blueleaf",
    "ways": [
      "gift",
      "branch"
    ]
  }
}/* ITEM_META_END */;
const rows=tables.flatMap(w=>[...w.querySelectorAll("tbody tr")].map(row=>{const id=row.querySelector("[id^=equipment-item-]")?.id,meta=itemMeta[id];if(!meta)return null;return {row,id,name:row.cells[0].querySelector("strong").textContent.trim(),part:row.cells[1].textContent.replace(/类别|Category/g,"").trim(),...meta};}));if(rows.length!==35||rows.some(x=>!x)||new Set(rows.map(x=>x.id)).size!==35)return;
const word=en?{title:'Find optional equipment',q:'Equipment name',region:'Region',part:'Slot',way:'Acquisition',all:'All',reset:'Clear filters',empty:'No matching items.',note:'Filters cover the 35 optional items. Original acquisition windows and restrictions remain in each row; automatic equipment stays below.',count:n=>`${n} / 35 optional items`,ways:['Shop','Backroom','Gift','Branch outcome','Conditional reward','Later story replacement']}: {title:'筛选可选装备',q:'装备名称',region:'地区',part:'部位',way:'取得方式',all:'全部',reset:'清除筛选',empty:'没有符合条件的装备。',note:'筛选范围是35件可选装备。具体日期与限制仍按各行说明，11件剧情自动装备保留在下方。',count:n=>`显示 ${n} / 35 件可选装备`,ways:['商店购买','后仓购买','赠送','分支取得','条件奖励','后期剧情补发']};
const host=document.createElement('section');host.className='equipment-finder';host.id='equipment-finder';const label=(id,title,options)=>`<label>${title}<select id="${id}"><option value="">${word.all}</option>${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
host.innerHTML=`<h2>${word.title}</h2><p>${word.note}</p><div class="equipment-filter-controls"><label>${word.q}<input id="eq-name" type="search"></label>${label('eq-region',word.region,regions.map((r,i)=>[r,names[i]]))}${label('eq-part',word.part,[...new Set(rows.map(r=>r.part))].map(r=>[r,r]))}${label('eq-way',word.way,['shop','backroom','gift','branch','reward','story'].map((r,i)=>[r,word.ways[i]]))}<button type="button" id="eq-reset">${word.reset}</button></div><p id="eq-count" role="status" aria-live="polite"></p><p id="eq-empty" hidden>${word.empty}</p>`;
const first=tables[0].closest('section.level2'),last=document.querySelector('#equipment-automatic'),siblings=[];for(let n=first;n&&n!==last;n=n.nextElementSibling)siblings.push(n);first.before(host);
let hidden=[];const restore=()=>{hidden.forEach(n=>n.classList.remove('eq-filter-hidden'));hidden=[];rows.forEach(r=>r.row.classList.remove('eq-filter-hidden'));};const hide=n=>{n.classList.add('eq-filter-hidden');hidden.push(n)};
const q=host.querySelector('#eq-name'),reg=host.querySelector('#eq-region'),part=host.querySelector('#eq-part'),way=host.querySelector('#eq-way');
function apply(){restore();const active=q.value||reg.value||part.value||way.value;let visible=0;const matches=new Set();for(const r of rows){const yes=(!q.value||r.name.toLowerCase().includes(q.value.trim().toLowerCase()))&&(!reg.value||r.region===reg.value)&&(!part.value||r.part===part.value)&&(!way.value||r.ways.includes(way.value));if(yes){visible++;matches.add(r.row.closest('section.level2'))}else r.row.classList.add('eq-filter-hidden');}if(active){for(const n of siblings){if(!matches.has(n)){hide(n);continue;}for(const child of n.children)if(child.tagName!=='H2'&&!child.classList.contains('kt-equipment-completion'))hide(child);}}host.querySelector('#eq-count').textContent=word.count(visible);host.querySelector('#eq-empty').hidden=visible!==0;}
function clear(){q.value=reg.value=part.value=way.value='';apply();}host.addEventListener('input',apply);host.addEventListener('change',apply);host.querySelector('#eq-reset').addEventListener('click',clear);
// Reveal the full original context before native anchor navigation, including table detail links.
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.href);if(u.pathname===location.pathname&&u.hash)clear();},true);addEventListener('hashchange',()=>{clear();const t=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(t)requestAnimationFrame(()=>t.scrollIntoView({block:'start'}));});apply();})();
