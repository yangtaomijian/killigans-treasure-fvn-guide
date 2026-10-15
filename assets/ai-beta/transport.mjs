import {checkRelease} from './release-guard.mjs';
// Same-origin KT single-question transport. No provider credentials, POST retry or body storage.
const validSession=value=>value?.httpStatus===200&&typeof value.authenticated==='boolean'&&(!value.authenticated||typeof value.user?.id==='string'&&value.user.id.length>0&&typeof value.csrf==='string'&&value.csrf.length>0);
export const REQUEST_SLOT='kt-qb1-request-id';
const activeStatuses=new Set(['accepted','processing','waiting','pending','unknown','UNKNOWN']);
const responseStatuses=new Set([...activeStatuses,'completed','cancelled','rejected','failed']);
const validatedState=value=>{if(value.httpStatus!==200)throw Error(value.code??value.error?.code??'STATE_UNAVAILABLE');if(!responseStatuses.has(value.status))throw Error('STATE_CONTRACT');return value;};
export function safeSourceURL(value){try{const u=new URL(value);return u.origin==='https://killigans-treasure.carambi.com'&&!u.username&&!u.password&&!u.search&&u.pathname.endsWith('.html')?u.href:null;}catch{return null;}}
export function percentage(value){return Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value/5)*5)):null;}
export function createTransport({fetchImpl=globalThis.fetch,storage=globalThis.sessionStorage,origin=globalThis.location?.origin,onSession=()=>{}}={}){
  let session=null,busy=false,uncertain=false,activeId=null,generation=0;
  let sessionVerified=false,snapshotVersion=0,requestOwner=null;
  const ownerSlot=REQUEST_SLOT+'-owner';
  const storeId=id=>{activeId=id;requestOwner=id?session?.user?.id??requestOwner:null;try{if(id){storage?.setItem(REQUEST_SLOT,id);if(requestOwner)storage?.setItem(ownerSlot,requestOwner);}else{storage?.removeItem(REQUEST_SLOT);storage?.removeItem(ownerSlot);}}catch{}};
  try{const id=storage?.getItem(REQUEST_SLOT);if(typeof id==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(id)){activeId=id;requestOwner=storage?.getItem(ownerSlot)??null;}}catch{}
  async function request(path,{method='GET',body,timeout=10000}={}){
    await checkRelease(path,method,fetchImpl);
    const url=new URL(path,origin);if(url.origin!==origin)throw Error('CROSS_ORIGIN_API_FORBIDDEN');
    const response=await fetchImpl(url.href,{method,credentials:'same-origin',cache:'no-store',redirect:'manual',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
    // An expired Access session must not redirect background requests away from the guide.
    if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)throw Error('ACCESS_REQUIRED');
    const data=await response.json();if(!data||typeof data!=='object'||Array.isArray(data))throw Error('RESPONSE_CONTRACT');
    return {...data,httpStatus:response.status};
  }
  function adoptSession(value){
    if(value!==null&&!validSession(value))throw Error('SESSION_UNAVAILABLE');
    const oldUser=session?.user?.id??requestOwner,newUser=value?.user?.id;
    if(value===null||!value.authenticated||(oldUser&&oldUser!==newUser)||(requestOwner&&requestOwner!==newUser)){generation++;snapshotVersion++;storeId(null);uncertain=false;}
    session=value;sessionVerified=value!==null&&!value.recoveryOnly;
    if(value?.authenticated&&typeof value.activeRequestId==='string'&&!activeId)storeId(value.activeRequestId);
    onSession(value);return value;
  }
  // Only identity + CSRF from the existing trusted shared session; never its
  // ready, allowance, active request ID or execution eligibility.
  function adoptRecoveryIdentity(identity,code){
    if(!validSession(identity))throw Error('SESSION_UNAVAILABLE');
    if(!identity.authenticated)return adoptSession(identity);
    const same=session?.user?.id===identity.user.id;
    return adoptSession({...(same?session:{}),authenticated:true,httpStatus:200,user:{id:identity.user.id},csrf:identity.csrf,
      activeRequestId:(requestOwner&&requestOwner!==identity.user.id)?null:activeId,
      ready:false,recoveryOnly:true,code,beta:{approved:false},allowance:null});
  }
  async function snapshot(){
    const own=++snapshotVersion,startGeneration=generation;
    try{const value=await request('/api/session');if(own!==snapshotVersion||startGeneration!==generation)throw Error('SESSION_CHANGED');
      if(!validSession(value))throw Error(value.code??value.error?.code??'SESSION_UNAVAILABLE');
      
      return adoptSession(value);
    }catch(error){if(own===snapshotVersion)sessionVerified=false;throw error;}
  }
  async function loginGoogle(credential,csrf){const value=await request('/auth/google',{method:'POST',body:{credential,csrf}});if(!validSession(value))throw Error(value.code??'SESSION_UNAVAILABLE');return adoptSession(value);}
  async function nonce(){return request('/auth/nonce',{method:'POST',body:{}});}
  async function logout(){sessionVerified=false;const value=await request('/auth/logout',{method:'POST',body:{csrf:session?.csrf}});if(!validSession(value)||value.authenticated!==false)throw Error(value.code??'LOGOUT_UNCONFIRMED');adoptSession(value);return value;}
  async function withdraw(){if(!session?.authenticated)throw Error('AUTH_REQUIRED');const result=await request('/api/withdraw',{method:'POST',body:{csrf:session.csrf}});if(result.status==='withdrawn')await snapshot();return result;}
  async function disableAccount(){if(!session?.authenticated)throw Error('AUTH_REQUIRED');const result=await request('/api/account-delete',{method:'POST',body:{csrf:session.csrf}});if(result.status==='account_disabled'){generation++;storeId(null);uncertain=false;adoptSession(null);}return result;}
  async function queryStatus(){if(!activeId)throw Error('NO_REQUEST');const id=activeId,own=generation,value=validatedState(await request('/api/status?requestId='+encodeURIComponent(id)));if(own!==generation||activeId!==id)throw Error('SESSION_CHANGED');uncertain=activeStatuses.has(value.status);if(!uncertain)storeId(null);return value;}
  async function send(question){
    if(busy||uncertain||activeId)throw Error('REQUEST_PENDING');if(!sessionVerified)throw Error(session?.code??'SESSION_UNAVAILABLE');if(!session?.authenticated||!session.csrf)throw Error('AUTH_REQUIRED');
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
  async function cancel(){if(!activeId)throw Error('NO_REQUEST');if(!session?.authenticated||!session.csrf)throw Error('AUTH_REQUIRED');const id=activeId,own=generation,value=validatedState(await request('/api/cancel',{method:'POST',body:{requestId:id,csrf:session.csrf}}));if(own!==generation||activeId!==id)throw Error('SESSION_CHANGED');uncertain=activeStatuses.has(value.status);if(!uncertain)storeId(null);return value;}
  return Object.freeze({snapshot,send,queryStatus,cancel,logout,withdraw,disableAccount,nonce,loginGoogle,adoptSession,adoptRecoveryIdentity,request,state:()=>({session,sessionVerified,busy,uncertain,activeId})});
}
