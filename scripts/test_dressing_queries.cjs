'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),core=require('../assets/kt-search-core.js');
const S=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(S,p),'utf8'));
const data=read('assets/kt-dressing-room.json'),aliases=read('scripts/search_aliases.json');let checked=0;
for(const loc of ['zh','en']){
 const pool=core.prepare(read(`_site/${loc==='en'?'en/':''}kt-search.json`),aliases,loc);
 for(const item of data.items){
  const query=`${item.characterName} ${item.categoryName} ${item.visibleValue}`;
  const rows=core.search(pool,query,{limit:10});
  assert(rows.some(r=>r.href.endsWith('#'+item.anchor)),`${loc}: ${query} -> ${item.anchor}`);checked++;
 }
 for(const group of aliases.groups.filter(g=>g.id.startsWith('system:')||g.id==='character:killigan')){
  for(const form of group.forms){
   assert(core.parseQuery(form,aliases,loc).concepts.includes(group.id),`${loc} alias ${form}`);checked++;
  }
 }
}
console.log(`Dressing queries PASS: 124 identities × 2 locales within top 10; system/character aliases; checks=${checked}`);
