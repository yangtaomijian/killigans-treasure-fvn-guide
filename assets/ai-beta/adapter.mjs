import {t} from './strings.mjs';
// Thin display projection. The QB1 product transport and its session/ticket/CSRF rules are unchanged.
import {createTransport,safeSourceURL,percentage} from './transport.mjs';
import {descriptions as productDescriptions,feedbackFor as productFeedback} from './feedback.mjs';
export {percentage};
export const descriptions=Object.freeze({...productDescriptions,PROVIDER_DISABLED:'AI 问答尚未开放',PROVIDER_ADMISSION_OFF:'AI 问答暂时不可用',GLOBAL_EMERGENCY_STOP:'AI 问答暂时不可用',BUDGET_CLOSED:'AI 问答暂时不可用',BETA_WINDOW_CLOSED:'AI 问答暂时不可用',BETA_QUESTION_LIMIT:'本轮可用题数已用完，未提交新题。',BETA_DAILY_QUESTION_LIMIT:'今天暂时无法继续提问，请稍后再试。',BETA_EXECUTION_CLOSED:'AI 问答暂时不可用'});
// Display only: a closed gate does not by itself prove that a Beta round ended.
export function availabilityText(state={}) {
  if(!state||!['PROVIDER_DISABLED','PROVIDER_ADMISSION_OFF','BETA_WINDOW_CLOSED','BETA_EXECUTION_CLOSED','GLOBAL_EMERGENCY_STOP','BUDGET_CLOSED'].includes(state.code))return null;
  const pilot=state.beta?.pilot;
  if(state.ready!==true&&pilot?.configured===true&&typeof pilot.endsAt==='number'&&Number.isFinite(pilot.endsAt)&&pilot.endsAt<=Date.now())return '本轮测试已结束';
  if(['PROVIDER_DISABLED','PROVIDER_ADMISSION_OFF','BETA_WINDOW_CLOSED'].includes(state.code)&&pilot?.configured===false)return 'AI 问答尚未开放';
  return descriptions[state.code];
}
export const feedbackFor=(value,state)=>t(availabilityText({...state,code:value?.code,ready:false})??descriptions[value?.code]??productFeedback(value));
export function createPanelTransport(options={}) {
  const product=createTransport({...options,fetchImpl:(...args)=>{queueMicrotask(()=>options.onStateChange?.());return (options.fetchImpl??globalThis.fetch)(...args);}}),sources=new Map();
  function project(raw) {
    sources.clear();
    const ids=new Map(),badIds=new Set(),badURLs=new Set();
    for(const s of raw.sources??[]) {
      const url=safeSourceURL(s.url??s.canonicalURL);
      if(!url||typeof s.id!=='string'||typeof s.text!=='string'||typeof s.title!=='string'||!['zh','en'].includes(s.locale))continue;
      if(ids.has(s.id))badIds.add(s.id);
      if(sources.has(url))badURLs.add(url);
      const source={...s,canonicalURL:url};ids.set(s.id,source);sources.set(url,source);
    }
    for(const id of badIds)ids.delete(id);
    for(const url of badURLs)sources.delete(url);
    const segments=(raw.segments??[]).filter(s=>typeof s.text==='string').map(s=>({text:s.text,references:(s.evidenceIds??[]).map(id=>ids.get(id)).filter(s=>s&&sources.has(s.canonicalURL)).map(s=>({label:s.title,url:s.canonicalURL}))}));
    const status=({completed:'answer',rejected:'limited',failed:'failure',pending:'failure',accepted:'failure',processing:'failure',waiting:'failure',unknown:'failure',UNKNOWN:'failure',cancelled:'cancelled'})[raw.status]??(raw.code?'limited':'failure');
    const uncertain=product.state().uncertain;
    const titles={answer:'本题回答',limited:'暂未接收本题',failure:uncertain?'本题状态待确认':'本题未完成',cancelled:'本题已取消'};
    const refund={REFUNDED:'本题额度已退还。',NOT_CHARGED:'本题未扣额度。',NOT_REFUNDED:'额度已按本题处理路径使用。',UNKNOWN:'额度结算待确认。',PENDING:'额度结算待确认。',CHARGED:'本题额度已结算。'};
    return {status,title:titles[status],text:descriptions[raw.code]?t(availabilityText({...product.state().session,code:raw.code,ready:false})??descriptions[raw.code]):raw.text??'',segments,provenance:raw.status==='completed'?'qb1-product':'host-service-failure',note:[raw.note,raw.partial===true?t('部分条件缺少证据；请查看回答限制。'):null,t(refund[String(raw.refundState).toUpperCase()])].filter(Boolean).join(' '),kind:uncertain?'local_connection':undefined,raw};
  }
  return Object.freeze({...product,send:async question=>project(await product.send(question)),queryStatus:async()=>project(await product.queryStatus()),cancel:async()=>project(await product.cancel()),sources:()=>new Map(sources),clearSources:()=>sources.clear(),safeSourceURL});
}
