import {t} from './strings.mjs';
// Thin display projection. The QB1 product transport and its session/ticket/CSRF rules are unchanged.
import {createTransport,safeSourceURL,percentage} from './transport.mjs';
import {descriptions as productDescriptions,feedbackFor as productFeedback} from './feedback.mjs';
export {percentage};
export const descriptions=Object.freeze({...productDescriptions,SOURCE_MAPPING_INCOMPLETE:'中文攻略来源暂未准备完整，本题未发送，也未扣试用题数。',SOURCE_MAPPING_VERSION_MISMATCH:'攻略来源版本暂不一致，本题未发送，也未扣试用题数。',PROVIDER_DISABLED:'AI 问答尚未开放',PROVIDER_ADMISSION_OFF:'AI 问答暂时不可用',GLOBAL_EMERGENCY_STOP:'AI 问答暂时不可用',BUDGET_CLOSED:'AI 问答暂时不可用',BETA_WINDOW_CLOSED:'AI 问答暂时不可用',BETA_QUESTION_LIMIT:'账户试用题数已用完，未提交新题。',OPEN_BETA_POOL_EXHAUSTED:'全站试用题数已用完，未提交新题。',OPEN_BETA_WITHDRAWN:'你已退出公开试用；本次未提交问题。',ACCOUNT_SNAPSHOT_EXPIRED:'AI 问答暂时不可用',BETA_DAILY_QUESTION_LIMIT:'全站滚动 24 小时内已发送 1 题，请在该题发送满 24 小时后重试。',BETA_EXECUTION_CLOSED:'AI 问答暂时不可用',SOURCE_LANGUAGE_MAPPING_MISSING:'部分所需来源的中文对应尚未核验，未生成回答。请改用英文提问或直接阅读攻略；本次已处理的检索仍按现有规则结算。',QUESTION_LANGUAGE_UNCLEAR:'问题语言不明确，请用中文或英文完整提问，或明确指定回答语言。',ANSWER_LANGUAGE_MISMATCH:'回答语言未符合要求，本题已停止，不会自动重试。'});
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
    const ids=new Map(),badIds=new Set();
    for(const s of raw.sources??[]) {
      const url=safeSourceURL(s.url??s.canonicalURL);
      const mappingType=s.mappingType??'excerpt';
      if(!url||typeof s.id!=='string'||typeof s.title!=='string'||!['zh','en'].includes(s.locale)||!['excerpt','section'].includes(mappingType)||mappingType==='excerpt'&&typeof s.text!=='string'||mappingType==='section'&&s.locale!=='zh')continue;
      if(ids.has(s.id))badIds.add(s.id);
      const source={...s,canonicalURL:url,mappingType};if(mappingType==='section')delete source.text;ids.set(s.id,source);
    }
    for(const id of badIds)ids.delete(id);
    const groups=new Map();
    for(const source of ids.values()){const group=groups.get(source.canonicalURL)??[];group.push(source);groups.set(source.canonicalURL,group);}
    for(const [url,group]of groups){if(group.every(s=>s.locale===group[0].locale)){
      const variants={};for(const mappingType of ['excerpt','section']){const parts=group.filter(s=>s.mappingType===mappingType);if(parts.length)variants[mappingType]={...parts[0],...(mappingType==='excerpt'?{text:[...new Set(parts.map(s=>s.text))].join('\n\n')}: {})};}
      sources.set(url,{...group[0],variants});
    }}
    const segments=(raw.segments??[]).filter(s=>typeof s.text==='string').map(s=>({text:s.text,references:[...new Map((s.evidenceIds??[]).map(id=>ids.get(id)).filter(s=>s&&sources.has(s.canonicalURL)).map(s=>[s.canonicalURL+'|'+s.mappingType,{label:s.title,url:s.canonicalURL,locale:s.locale,mappingType:s.mappingType}])).values()]}));
    const status=({completed:'answer',rejected:'limited',failed:'failure',pending:'failure',accepted:'failure',processing:'failure',waiting:'failure',unknown:'failure',UNKNOWN:'failure',cancelled:'cancelled'})[raw.status]??(raw.code?'limited':'failure');
    const uncertain=product.state().uncertain;
    const titles={answer:'本题回答',limited:'暂未接收本题',failure:uncertain?'本题状态待确认':'本题未完成',cancelled:'本题已取消'};
    const refund={REFUNDED:'本题额度已退还。',NOT_CHARGED:'本题未扣额度。',NOT_REFUNDED:'额度已按本题处理路径使用。',UNKNOWN:'额度结算待确认。',PENDING:'额度结算待确认。',CHARGED:'本题额度已结算。'};
    const settlement=t(refund[String(raw.refundState).toUpperCase()]);
    const completed=raw.status==='completed'&&segments.length>0;
    const partial=raw.partial===true?t('部分条件缺少证据；请查看回答限制。'):null;
    return {status,title:titles[status],text:completed?'':descriptions[raw.code]?t(availabilityText({...product.state().session,code:raw.code,ready:false})??descriptions[raw.code]):raw.text??'',segments,provenance:raw.status==='completed'?'qb1-product':'host-service-failure',note:raw.note??'',serviceStatus:[completed?t('回答已完成'):null,partial,settlement].filter(Boolean).join(' · '),kind:uncertain?'local_connection':undefined,raw};
  }
  return Object.freeze({...product,send:async question=>project(await product.send(question)),queryStatus:async()=>project(await product.queryStatus()),cancel:async()=>project(await product.cancel()),sources:()=>new Map(sources),clearSources:()=>sources.clear(),safeSourceURL});
}
