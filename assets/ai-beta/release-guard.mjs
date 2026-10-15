// Every release keeps its complete relative module graph and stylesheet together.
const base=new URL('./',import.meta.url),release=base.pathname.match(/\/releases\/([a-f0-9]{24})\/$/)?.[1];
export function assertModule(url){
 if(typeof document==='undefined')return;
 if(!release||new URL('./',url).href!==base.href||document.querySelector('meta[name="kt-ai-release"]')?.content!==release)throw Error('RELEASE_MISMATCH');
 const css=[...document.querySelectorAll('link[rel="stylesheet"]')].find(x=>x.href===new URL('panel.css',base).href);
 if(!css)throw Error('RELEASE_MISMATCH');
}
export async function checkRelease(path,method,fetchImpl){
 if(typeof document==='undefined'||method==='GET')return;
 // Result/status/cancellation and account cleanup remain available for pending work.
 const changes=/^\/api\/(?:followup\/(?:conversation|request-ticket|ask)|request-ticket|ask)$/.test(path);
 if(!changes)return;
 assertModule(import.meta.url);
 const url=new URL('../../active-release.json',base);url.searchParams.set('check',crypto.randomUUID());
 let data;try{const r=await fetchImpl(url.href,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();data=await r.json();}catch{throw Error('RELEASE_UNVERIFIED');}
 if(data.release!==release)throw Error('RELEASE_CHANGED');
}
