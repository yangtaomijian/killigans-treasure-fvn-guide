import {createPanelTransport} from './adapter.mjs';
const fallbackReasons=new Set(['BETA_NOT_APPROVED','FOLLOWUP_ACCOUNT_GROUP_LIMIT','FOLLOWUP_GROUP_LIMIT','FOLLOWUP_DAILY_GROUP_LIMIT','SHORT_SESSION_TURN_LIMIT','REQUEST_ATTEMPT_LIMIT']);
export function fallbackEligible(primary,legacy,now=Date.now()){
 const pilot=legacy?.beta?.pilot;
 return primary?.authenticated===true&&primary.httpStatus===200&&primary.ready===false&&fallbackReasons.has(primary.code)&&legacy?.authenticated===true&&legacy.httpStatus===200&&legacy.user?.id===primary.user?.id&&legacy.ready===true&&legacy.beta?.approved===true&&pilot?.configured===true&&pilot.used!==true&&typeof pilot.poolRemaining==='number'&&pilot.poolRemaining>0&&pilot.rolling24hAvailable!==false&&!(typeof pilot.endsAt==='number'&&pilot.endsAt<=now)&&!(typeof pilot.remainingQuestions==='number'&&pilot.remainingQuestions<=0)&&legacy.allowance?.balance>=1000&&!primary.activeRequestId&&!legacy.activeRequestId;
}
export function createModeTransport(options={}){
 let mode='followup',primary=null,legacy=null,consent=false,probing=false,snapshotVersion=0,seenUser=undefined,identityConfirmed=false;const transports={};let hiddenExpiryTimer;const trackExpiry=s=>{clearTimeout(hiddenExpiryTimer);const expiry=s?.followup?.expiresAt;if(Number.isFinite(expiry))hiddenExpiryTimer=setTimeout(()=>{if(mode!=='followup'){transports.followup?.clearTemporaryBody();transports.followup?.clearSources();}},Math.max(1,expiry-Date.now()));};
 for(const name of ['single','followup'])transports[name]=createPanelTransport({...options,mode:name,onSession:s=>{if(name==='followup')trackExpiry(s);if(mode===name&&!probing)options.onSession?.(visible(s));}});
 const current=()=>transports[mode];
 const call=name=>(...args)=>current()[name](...args);
 const pending=()=>Object.values(transports).some(t=>t.state().busy||t.state().uncertain||t.state().activeId);
 const eligible=()=>identityConfirmed&&!primary?.recoveryOnly&&fallbackEligible(primary,legacy)&&!pending();
 function visible(s){return mode==='single'&&s?{...s,ready:consent&&eligible()&&s.ready===true}:s;}
 function rememberIdentity(value){const next=value?.authenticated?value.user.id:null;if(seenUser!==undefined&&seenUser!==next)for(const t of Object.values(transports))t.clearSources();const first=seenUser!==next;seenUser=next;identityConfirmed=true;return first;}
 async function snapshot(){const version=++snapshotVersion;probing=true;identityConfirmed=false;let resolved=false;try{
   let error;
   try{primary=await transports.followup.snapshot();}catch(e){error=e;}
   if(version!==snapshotVersion)throw Error('SESSION_CHANGED');
   if(error){
     consent=false;legacy=await transports.single.snapshot().catch(()=>null);
     if(version!==snapshotVersion)throw Error('SESSION_CHANGED');
     if(!legacy)throw error;
     if(!legacy.authenticated){primary=transports.followup.adoptSession(legacy);mode='followup';}
     else{primary=transports.followup.adoptRecoveryIdentity(legacy,error.message);mode=transports.followup.state().activeId?'followup':transports.single.state().activeId?'single':'followup';}
     rememberIdentity(legacy);resolved=true;return visible(mode==='followup'?primary:legacy);
   }
   if(options.followupAvailable===false)primary={...primary,ready:false,code:'FOLLOWUP_NOT_ENABLED'};
   if(!primary.authenticated){consent=false;mode='followup';legacy=null;transports.single.adoptSession(primary);}
   else{
     legacy=await transports.single.snapshot().catch(()=>null);
     if(version!==snapshotVersion)throw Error('SESSION_CHANGED');
     if(!legacy){transports.single.adoptRecoveryIdentity(primary,'SESSION_UNAVAILABLE');if(mode==='single'&&!transports.single.state().activeId){mode='followup';consent=false;}}
     if(legacy&&!legacy.authenticated){primary=transports.followup.adoptSession(legacy);mode='followup';consent=false;}
     else if(legacy&&legacy.user.id!==primary.user.id){primary=transports.followup.adoptRecoveryIdentity(legacy,'SESSION_CHANGED');mode='followup';consent=false;}
   }
   const first=rememberIdentity(primary);
   if(first&&!consent&&legacy?.authenticated&&transports.single.state().activeId&&!transports.followup.state().activeId)mode='single';
   resolved=true;return visible(mode==='followup'?primary:current().state().session);
 }finally{if(version===snapshotVersion){probing=false;if(resolved)options.onSession?.(visible(mode==='followup'?primary:current().state().session));}}}
 // Revalidate identity before operating a stored ID. Never substitute a newly
 // discovered request for the one the player chose to query/cancel.
 async function pendingAction(name){const selected=mode,id=current().state().activeId;if(!id)throw Error('NO_REQUEST');await snapshot();if(transports[selected].state().activeId!==id)throw Error('SESSION_CHANGED');mode=selected;return transports[selected][name]();}
 async function chooseFallback(){await snapshot();if(!eligible())throw Error('FALLBACK_UNAVAILABLE');consent=true;mode='single';options.onSession?.(visible(legacy));return visible(legacy);}
 async function returnToFollowup(){if(pending())throw Error('REQUEST_PENDING');consent=false;mode='followup';return snapshot();}
 function recoverOther(){if(!identityConfirmed)throw Error('SESSION_UNAVAILABLE');if(Object.values(transports).some(t=>t.state().busy))throw Error('REQUEST_PENDING');const other=mode==='followup'?'single':'followup';if(!transports[other].state().activeId)throw Error('NO_REQUEST');mode=other;consent=false;options.onSession?.(visible(current().state().session));}
 async function send(question){if(!identityConfirmed||primary?.recoveryOnly)throw Error(primary?.code??'SESSION_UNAVAILABLE');if(mode==='followup'&&options.followupAvailable===false)throw Error('FOLLOWUP_NOT_ENABLED');if(mode==='single'){if(!consent||!eligible())throw Error('FALLBACK_UNAVAILABLE');consent=false;}return current().send(question);}
 return Object.freeze({mode:()=>mode,chooseFallback,returnToFollowup,recoverOther,state:()=>({...current().state(),fallbackAvailable:eligible(),singleConsent:consent,probing,pendingOther:Object.entries(transports).some(([n,t])=>n!==mode&&(t.state().busy||t.state().uncertain||!!t.state().activeId))}),snapshot,send,queryStatus:()=>pendingAction('queryStatus'),cancel:()=>pendingAction('cancel'),nonce:call('nonce'),loginGoogle:async(...args)=>{await current().loginGoogle(...args);return snapshot();},logout:async()=>{snapshotVersion++;identityConfirmed=false;consent=false;const r=await current().logout();seenUser=undefined;primary=null;legacy=null;mode='followup';for(const t of Object.values(transports))t.adoptSession(r);return r;},withdraw:call('withdraw'),disableAccount:call('disableAccount'),endConversation:call('endConversation'),projectHistory:call('projectHistory'),sources:call('sources'),clearSources:call('clearSources'),safeSourceURL:call('safeSourceURL')});
}
