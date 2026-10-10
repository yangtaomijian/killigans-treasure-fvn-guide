// Same-origin KT single-question transport. No provider credentials, POST retry or body storage.
export const REQUEST_SLOT='kt-qb1-request-id';
const activeStatuses=new Set(['accepted','processing','waiting','pending','unknown','UNKNOWN']);
const responseStatuses=new Set([...activeStatuses,'completed','cancelled','rejected','failed']);
const validatedState=value=>{if(!responseStatuses.has(value.status))throw Error('STATE_CONTRACT');return value;};
export function safeSourceURL(value){try{const u=new URL(value);return u.origin==='https://killigans-treasure.carambi.com'&&!u.username&&!u.password&&!u.search&&u.pathname.endsWith('.html')&&u.hash?u.href:null;}catch{return null;}}
export function percentage(value){return Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value/5)*5)):null;}
export function createTransport({fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,origin=globalThis.location?.origin,onSession=()=>{}}={}){
  let session=null,busy=false,uncertain=false,activeId=null,generation=0;
  const storeId=id=>{activeId=id;try{id?storage?.setItem(REQUEST_SLOT,id):storage?.removeItem(REQUEST_SLOT);}catch{}};
  try{const id=storage?.getItem(REQUEST_SLOT);if(typeof id==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(id))activeId=id;}catch{}
  async function request(path,{method='GET',body,timeout=10000}={}){
    const url=new URL(path,origin);if(url.origin!==origin)throw Error('CROSS_ORIGIN_API_FORBIDDEN');
    const response=await fetchImpl(url.href,{method,credentials:'same-origin',cache:'no-store',redirect:'manual',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
    // An expired Access session must not redirect background requests away from the guide.
    if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)throw Error('ACCESS_REQUIRED');
    const data=await response.json();if(!data||typeof data!=='object'||Array.isArray(data))throw Error('RESPONSE_CONTRACT');
    return {...data,httpStatus:response.status};
  }
  function adoptSession(value){const oldUser=session?.user?.id,newUser=value?.user?.id;if(!value?.authenticated||(oldUser&&oldUser!==newUser)){generation++;storeId(null);uncertain=false;}session=value;if(value?.authenticated&&typeof value.activeRequestId==='string'&&!activeId)storeId(value.activeRequestId);onSession(value);return value;}
  async function snapshot(){return adoptSession(await request('/api/session'));}
  async function loginGoogle(credential,csrf){return adoptSession(await request('/auth/google',{method:'POST',body:{credential,csrf}}));}
  async function nonce(){return request('/auth/nonce',{method:'POST',body:{}});}
  async function logout(){generation++;const csrf=session?.csrf;session=null;storeId(null);uncertain=false;onSession(null);return request('/auth/logout',{method:'POST',body:{csrf}});}
  async function withdraw(){if(!session?.authenticated)throw Error('AUTH_REQUIRED');const result=await request('/api/withdraw',{method:'POST',body:{csrf:session.csrf}});if(result.status==='withdrawn')await snapshot();return result;}
  async function disableAccount(){if(!session?.authenticated)throw Error('AUTH_REQUIRED');const result=await request('/api/account-delete',{method:'POST',body:{csrf:session.csrf}});if(result.status==='account_disabled'){generation++;storeId(null);uncertain=false;adoptSession(null);}return result;}
  async function queryStatus(){if(!activeId)throw Error('NO_REQUEST');const value=validatedState(await request('/api/status?requestId='+encodeURIComponent(activeId)));uncertain=activeStatuses.has(value.status);if(!uncertain){storeId(null);}return value;}
  async function send(question){
    if(busy||uncertain||activeId)throw Error('REQUEST_PENDING');if(!session?.authenticated||!session.csrf)throw Error('AUTH_REQUIRED');
    if(typeof question!=='string'||!question.trim()||question.length>1200)throw Error('QUESTION_INVALID');
    busy=true;const startGeneration=generation;let dispatched=false;
    try{
      const signed=await request('/api/request-ticket',{method:'POST',body:{csrf:session.csrf}});
      if(typeof signed.requestId!=='string'||typeof signed.ticket!=='string')return signed;
      if(startGeneration!==generation)throw Error('SESSION_CHANGED');storeId(signed.requestId);
      dispatched=true;
      const value=validatedState(await request('/api/ask',{method:'POST',body:{question,requestId:signed.requestId,ticket:signed.ticket,csrf:session.csrf},timeout:185000}));
      if(startGeneration!==generation)throw Error('SESSION_CHANGED');
      uncertain=activeStatuses.has(value.status);if(!uncertain)storeId(null);return value;
    }catch(error){if(dispatched&&startGeneration===generation){uncertain=true;return {status:'unknown',code:'CONNECTION_UNKNOWN',refundState:'UNKNOWN'};}throw error;}
    finally{busy=false;}
  }
  async function cancel(){if(!activeId)throw Error('NO_REQUEST');const value=validatedState(await request('/api/cancel',{method:'POST',body:{requestId:activeId,csrf:session?.csrf}}));uncertain=activeStatuses.has(value.status);if(!uncertain)storeId(null);return value;}
  return Object.freeze({snapshot,send,queryStatus,cancel,logout,withdraw,disableAccount,nonce,loginGoogle,adoptSession,request,state:()=>({session,busy,uncertain,activeId})});
}
