import {t} from './strings.mjs';
import './panel.mjs';
// Keep the nonce-first GIS contract. Prepare Google only after an explicit sign-in action.
let prepared=null;
const target=document.getElementById('google-gis'),old=document.getElementById('google');
const report=(phase,message='')=>window.KTProductGoogle.onUIStatus({phase,message});
async function prepare(clientId){
 report('preparing',t('正在准备 Google 登录…'));
 prepared=await window.KTProductGoogle.prepare();
 google.accounts.id.initialize({client_id:clientId,nonce:prepared.nonce,auto_select:false,use_fedcm_for_prompt:false,
  callback:async r=>{
   const current=prepared;prepared=null;
   try{if(!current||typeof r.credential!=='string')throw Error('GOOGLE_NONCE_REQUIRED');await window.KTProductGoogle.complete(r.credential);report('ready');}
   catch{report('retry',t('登录未完成；请重新准备登录。'));}
   finally{r.credential=null;target.replaceChildren();old.textContent=t('Google 登录');window.KTProductGoogle.refreshUI();}
  }});
 google.accounts.id.renderButton(target,{type:'standard',theme:'outline',size:'large',text:'signin_with',width:Math.min(348,target.parentElement.clientWidth||260)});
 report('ready');
}
let clientId=null,scriptPromise=null,accessOpened=false,starting=false;
async function start(){
 if(starting)return;
 starting=true;report('preparing',t('正在准备 Google 登录…'));
 try{
  const response=await fetch('/auth/config',{credentials:'same-origin',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(response.type==='opaqueredirect'||response.status>=300&&response.status<400)throw Error('ACCESS_REQUIRED');
  if(!response.ok)throw Error('CONFIG_UNAVAILABLE');
  const config=await response.json();clientId=config.googleClientId;
  if(typeof clientId!=='string'||!/^\d+-[-\w]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('CONFIG_UNAVAILABLE');
  if(!scriptPromise){
   const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.referrerPolicy='no-referrer';
   scriptPromise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('GIS_UNAVAILABLE')),10000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('GIS_UNAVAILABLE'));};document.head.append(script);}).catch(error=>{scriptPromise=null;throw error;});
  }
  await scriptPromise;
  accessOpened=false;
  await prepare(clientId);
 }catch(error){
  if(error.message==='ACCESS_REQUIRED'){accessOpened=false;report('retry',t('未能确认测试访问权限。可申请 Beta，或完成验证后重试。'));}
  else report('retry',t('登录准备失败；请稍后主动重试。'));
 }finally{starting=false;}
}
old.addEventListener('click',()=>{
 if(window.KTProductGoogle.requiresAccess()&&!accessOpened){
  // Only this explicit click opens the existing protected route. No background navigation.
  window.open('/auth/config','_blank','noopener,noreferrer');accessOpened=true;
  report('retry',t('完成测试访问验证后，请返回此页继续 Google 登录。'));
  return;
 }
 start();
});
report('ready');
