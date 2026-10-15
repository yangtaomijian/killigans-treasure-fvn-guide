import {createModeTransport} from './mode-transport.mjs';
import {FOLLOWUP_MODE_AVAILABLE} from './followup-config.mjs';
import {t} from './strings.mjs';
import {questionLengths} from './question-limits.mjs';
import {questionLanguage,languageClarification} from './question-language.mjs';
import {percentage,descriptions,feedbackFor,availabilityText} from './adapter.mjs';
(() => {
  'use strict';
  // Same-origin product panel; keep the guide's own navigation and TOC.

  const narrow = matchMedia('(max-width: 991px)');
  // Preserve Codex's native columns inside a bounded horizontal scroll area
  // when the desktop AI rail leaves too little room for its four fields.
  document.querySelectorAll('main.content table.kt-codex-responsive-table').forEach(table => {
    const wrap = document.createElement('div');
    wrap.className = 'kt-ai-codex-scroll quarto-table-container';
    table.before(wrap); wrap.append(table);
  });
  // Restore a visible reading point after desktop column/record reflow, not old scrollY.
  let readingTransaction;
  function readingPoint() {
    const main = document.querySelector('main.content'), header = document.getElementById('quarto-header');
    if (!main) return null;
    const top = (header?.getBoundingClientRect().bottom || 0) + 12;
    const visible = el => { const r = el.getBoundingClientRect(); return r.height > 2 && r.top >= top && r.top < innerHeight * .55; };
    // Prefer the section near the upper reading area over a preceding heading
    // that has only just cleared the fixed header.
    const readingY = top + Math.min(180, (innerHeight - top) / 4);
    const heading = [...main.querySelectorAll('h1,h2,h3,h4')].filter(visible)
      .sort((a,b) => Math.abs(a.getBoundingClientRect().top - readingY) - Math.abs(b.getBoundingClientRect().top - readingY))[0];
    const tableAbove = heading && [...main.querySelectorAll('table')].some(el => { const r = el.getBoundingClientRect(); return r.bottom > top && r.top < heading.getBoundingClientRect().top; });
    if (heading && (!tableAbove || heading.getBoundingClientRect().top <= readingY + 80)) return { rect: () => heading.getBoundingClientRect(), y: heading.getBoundingClientRect().top };
    const r = main.getBoundingClientRect(), x = r.left + parseFloat(getComputedStyle(main).paddingLeft) + Math.min(32, r.width / 8);
    for (let y = Math.max(top, r.top + 2); y < innerHeight - 24; y += 16) {
      let range = document.caretRangeFromPoint?.(x, y);
      if (!range && document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true); } }
      const text = range?.startContainer, parent = text?.parentElement;
      if (text?.nodeType !== Node.TEXT_NODE || !text.textContent.trim() || parent?.closest('[aria-hidden="true"]') || !parent?.closest('main.content,footer.footer')) continue;
      range = range.cloneRange(); range.setEnd(text, Math.min(text.length, range.startOffset + 1));
      const at = range.getBoundingClientRect();
      if (at.height > 2 && at.top >= top - 2 && at.top < innerHeight) return { rect: () => range.getBoundingClientRect(), y: at.top };
    }
    // Table gutters can yield an element caret rather than a text caret.
    // Fall back to an actual visible glyph, keeping its DOM text/offset even
    // when a row becomes a stack of labelled fields.
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      if (!text.textContent.trim() || text.parentElement?.closest('[aria-hidden="true"]')) continue;
      const range = document.createRange(); range.selectNodeContents(text);
      if (![...range.getClientRects()].some(box => box.height > 2 && box.width > 2 && box.right > r.left && box.left < r.right && box.bottom > top && box.top < innerHeight - 24)) continue;
      for (let offset = 0; offset < text.length; offset++) {
        range.setStart(text, offset); range.setEnd(text, offset + 1);
        const box = range.getBoundingClientRect();
        if (box.height > 2 && box.width > 0 && box.top >= top - 2 && box.top < innerHeight - 24 && box.right > r.left && box.left < r.right)
          return { rect: () => range.getBoundingClientRect(), y: box.top };
      }
    }
    return null;
  }
  function preserveReading(change) {
    readingTransaction?.();
    if (narrow.matches) return change();
    const point = readingPoint();
    if (!point) return change();
    // Browsers round scroll offsets to pixels. Keep a stable pixel target so
    // repeated open/close cycles cannot accumulate half-pixel drift.
    point.y = Math.round(point.y);
    const root = document.documentElement, previous = root.style.overflowAnchor;
    let frame = 0, count = 0, stable = 0, lastHeight = -1, stopped = false;
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(frame); root.style.overflowAnchor = previous; events.forEach(name => document.removeEventListener(name, stop, true)); window.removeEventListener('hashchange', stop); if (readingTransaction === stop) readingTransaction = null; document.dispatchEvent(new Event('kt:reading-layout-settled')); };
    readingTransaction = stop; root.style.overflowAnchor = 'none';
    events.forEach(name => document.addEventListener(name, stop, {capture:true,passive:true})); window.addEventListener('hashchange', stop);
    const restore = () => { const rect = point.rect(); if (rect.height > 2) { const delta = rect.top - point.y; const next = Math.round(scrollY + delta); if (Math.abs(delta) > .01 && next !== scrollY) scrollTo({top:next,left:scrollX,behavior:'instant'}); } };
    try { change(); document.dispatchEvent(new Event('kt:reading-columns-change')); restore(); } catch (error) { stop(); throw error; }
    const settle = () => { if (stopped) return; restore(); const height = root.scrollHeight; stable = height === lastHeight ? stable + 1 : 0; lastHeight = height; if (++count >= 8 || stable >= 3) stop(); else frame = requestAnimationFrame(settle); };
    frame = requestAnimationFrame(settle);
  }
  const search = document.getElementById('kt-search-launcher');
  if (!search || document.getElementById('kt-ai-launcher')) return;
  const node = (tag, text, attrs = {}) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    return el;
  };
  const launcher = node('button', undefined, { id: 'kt-ai-launcher', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'kt-ai-panel' });
  launcher.append(node('span', t('AI 问攻略')), node('span', 'Beta', { class: 'kt-ai-mode' }));
  search.after(launcher);
  const panel = node('aside', undefined, { id: 'kt-ai-panel', 'aria-labelledby': 'kt-ai-title' });
  panel.hidden = true;
  const head = node('div', undefined, { class: 'kt-ai-head' });
  const heading = node('div');
  heading.append(node('h2', t('问攻略'), { id: 'kt-ai-title' }), node('span', 'Beta', { class: 'kt-ai-eyebrow' }));
  const close = node('button', t('关闭'), { id: 'kt-ai-close', type: 'button', 'aria-label': t('关闭 AI 面板') });
  head.append(heading, close);
  const scroll = node('div', undefined, { class: 'kt-ai-scroll' });
  const notice = node('div', undefined, { class:'kt-ai-notice', 'aria-label':t('登录与测试资格') });
  let sessionPhase='checking',googlePhase='loading',googleMessage='',loggingOut=false;
  const identity = node('p',t('正在确认登录…'),{id:'kt-ai-identity',class:'kt-ai-permission'});
  const account = node('div', undefined, {class:'kt-ai-account'});
  const google = node('button',t('Google 登录'),{id:'google',type:'button',title:t('Google 登录')}); google.disabled=true;
  const gis = node('div',undefined,{id:'google-gis'});
  const logout = node('button',t('退出'),{type:'button'}); logout.hidden=true;
  const sessionRetry=node('button',t('重新读取'),{id:'kt-ai-session-retry',type:'button'});sessionRetry.hidden=true;
  account.append(google,gis,logout,sessionRetry);
  const permission = node('p',t('正在确认测试资格…'),{id:'kt-ai-quota',class:'kt-ai-quota'});
  const modeCheck = node('p','',{id:'kt-ai-mode-check',class:'kt-ai-note'}); modeCheck.hidden=true;
  const funds = node('details',undefined,{class:'kt-ai-funds'}); funds.hidden=true;
  const budget = node('p','',{id:'kt-ai-budget',class:'kt-ai-note'});
  funds.append(node('summary',t('可用额度详情')),budget);
  const betaApply=node('button',t('申请 Beta'),{id:'kt-ai-beta-apply',type:'button',class:'kt-ai-text-button'});betaApply.hidden=true;
  document.addEventListener('kt:beta-application-ready',()=>sync());
  const entryLabel=node('p',t('Limited Follow-up · 主问＋2次追问'),{id:'kt-ai-entry-label',class:'kt-ai-note'});
  const fallbackChoice=node('button',t('使用一次性单轮备用'),{id:'kt-ai-single-fallback',type:'button',class:'kt-ai-text-button'});fallbackChoice.hidden=true;
  const primaryChoice=node('button',t('返回追问聊天'),{id:'kt-ai-primary-chat',type:'button',class:'kt-ai-text-button'});primaryChoice.hidden=true;
  const pendingChoice=node('button',t('查看另一个待确认请求'),{id:'kt-ai-pending-other',type:'button',class:'kt-ai-text-button'});pendingChoice.hidden=true;
  const endGroup=node('button',t('结束本组'),{id:'kt-ai-end-group',type:'button',class:'kt-ai-text-button'});endGroup.hidden=true;
  notice.append(entryLabel,identity,account,permission,fallbackChoice,primaryChoice,pendingChoice,endGroup,modeCheck,funds,betaApply);
  const query = node('button',t('查看进度'),{id:'kt-ai-query',type:'button'}); query.hidden=true;
  const privacyCopy=t('启用 AI 问答后，问题和相关攻略材料会由 OpenAI 处理。本站不保存问答正文；OpenAI 按其政策处理数据，不能保证零保留。请勿填写账号信息、密钥或其他敏感内容。');
  let privacyReviewed=false,composing=false,compositionEndedAt=0,sending=false,cancelling=false,manualCheckNeeded=false;
  const privacyFirst=node('section',undefined,{id:'kt-ai-privacy-first',class:'kt-ai-privacy-first','aria-labelledby':'kt-ai-privacy-heading'});
  const privacyAck=node('button',t('我已了解，继续输入'),{id:'kt-ai-privacy-ack',type:'button'});
  const privacyMore=node('button',t('查看隐私说明'),{type:'button',class:'kt-ai-text-button'});
  const singlePolicyNote=node('p',t('Open Beta：Google 登录后可试用，每账户最多 1 题，全站共 5 题（含站长首测），全站滚动 24 小时最多 1 题。本轮自首次正式开放起固定 14 天，期限结束或全站题数用完后结束；停用或重启不会延长期限，额度不会自动补充。'));
  const followupPolicyNote=node('p',t('Limited Follow-up：每账户最多1组，全局5组，每24小时最多新增1组；每组最多3次完成交互及3次请求尝试，3000处理额度不自动补充。本轮测试为14天。'));followupPolicyNote.hidden=true;
  privacyFirst.append(node('h3',t('提问前，请先了解'),{id:'kt-ai-privacy-heading'}),
    node('p',t('可以先输入问题。首次发送前，请确认已阅读以下说明。')),
    node('p',t('AI 可能误读或遗漏攻略条件，请核对引用原文。')),
    node('p',t('无法读取你的游戏存档；请在问题中说明路线与进度。')),
    node('p',t('启用 AI 问答后，问题与相关攻略材料会由 OpenAI 处理；详见「隐私与数据」。')),
    singlePolicyNote,followupPolicyNote,privacyAck,privacyMore);
  const empty=node('p',t('想查哪段攻略？在下方写下你的问题。'),{class:'kt-ai-empty'});
  const result=node('section',undefined,{id:'kt-ai-result','aria-label':t('问题与回答')});result.hidden=true;
  const scope=node('p',t('可选的 AI 问答工具，只检索本站公开的攻略资料，并根据检索结果生成回答。它不会搜索其他网站，也不会读取游戏代码或非公开内容。主线攻略和参考页面独立维护。'),{id:'kt-ai-scope',class:'kt-ai-note'});
  scroll.append(scope,privacyFirst,query,empty,result);
  const form=node('form',undefined,{id:'kt-ai-form'});
  const label=node('label',t('你的问题'),{for:'kt-ai-question',class:'kt-ai-sr-only'});
  const input=node('textarea',undefined,{id:'kt-ai-question',rows:'2',placeholder:t('想了解什么？'),'aria-describedby':'kt-ai-status kt-ai-length-help'});
  const composer=node('div',undefined,{class:'kt-ai-composer'});
  const lengthCounter=node('span','',{id:'kt-ai-length',role:'status','aria-live':'polite','aria-atomic':'true'});lengthCounter.hidden=true;
  const lengthHelp=node('span','',{id:'kt-ai-length-help',class:'kt-ai-sr-only'});
  const send=node('button',undefined,{id:'kt-ai-send',type:'button','aria-label':t('发送问题'),title:t('发送问题')});send.disabled=true;
  const svgNS='http://www.w3.org/2000/svg';
  function icon(kind){const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('kt-ai-icon-'+kind);const shape=document.createElementNS(svgNS,kind==='arrow'?'path':'rect');if(kind==='arrow'){shape.setAttribute('d','M12 19V5M5 12l7-7 7 7');shape.setAttribute('fill','none');shape.setAttribute('stroke','currentColor');shape.setAttribute('stroke-width','2');shape.setAttribute('stroke-linecap','round');shape.setAttribute('stroke-linejoin','round');}else{for(const [k,v] of Object.entries({x:7,y:7,width:10,height:10,rx:1,fill:'currentColor'}))shape.setAttribute(k,v);}svg.append(shape);return svg;}
  send.append(icon('arrow'),icon('stop'));composer.append(label,input,lengthCounter,lengthHelp,send);
  const footer=node('div',undefined,{class:'kt-ai-form-footer'});
  const status=node('span','',{id:'kt-ai-status',role:'status','aria-live':'polite','aria-atomic':'true'});
  const quality=node('span',t('AI 可能出错 · 请核对引用原文'),{id:'kt-ai-quality'});
  const privacyLink=node('button',t('隐私与数据'),{id:'kt-ai-privacy-link',type:'button',class:'kt-ai-text-button'});
  footer.append(quality,privacyLink);form.append(composer,status,footer);
  const privacyDialog=node('dialog',undefined,{id:'kt-ai-privacy-dialog','aria-labelledby':'kt-ai-privacy-title'});
  const privacyClose=node('button',t('返回'),{type:'button','aria-label':t('关闭隐私说明')});
  const privacyConfirm=node('button',t('我已了解，发送此问题'),{id:'kt-ai-privacy-confirm',type:'button'});privacyConfirm.hidden=true;
  let pendingConsentQuestion=null;
  privacyDialog.append(node('h3',t('隐私说明'),{id:'kt-ai-privacy-title'}),node('p',privacyCopy),node('p',t('AI 可能出错；攻略材料可能包含后续剧情，本工具不提供严格剧透过滤。请核对引用原文。')),node('p',t('服务保留必要的请求状态、额度结算与防滥用记录。问答正文仅在当前页面显示；刷新后不会恢复。')),node('p',t('为防止额度重复领取，服务长期保留与 Google 账户关联的身份摘要、已用试用题数和退出标记；重新登录、退出或停用账户不会重置题数。已结清账务明细保留 90 天，之后保留累计费用汇总；未结责任保留至人工核对完成。')),privacyConfirm,privacyClose);
  const contextPrivacy=node('p',t('本组玩家原文、状态及问答从创建起最多暂存30分钟，可刷新恢复；结束本组、退出登录、撤回或停用账户时清除。实际状态与临时假设分开，不提供长期历史或跨组记忆。'));contextPrivacy.hidden=true;privacyDialog.append(contextPrivacy);
  function openPrivacy(forSend=false){pendingConsentQuestion=forSend?input.value:null;privacyConfirm.hidden=!forSend;privacyDialog.showModal();}
  privacyLink.addEventListener('click',()=>openPrivacy());privacyMore.addEventListener('click',()=>openPrivacy());privacyClose.addEventListener('click',()=>privacyDialog.close());
  privacyDialog.addEventListener('close',()=>{pendingConsentQuestion=null;privacyConfirm.hidden=true;});
  privacyConfirm.addEventListener('click',()=>{const question=pendingConsentQuestion;privacyReviewed=true;privacyFirst.hidden=true;privacyDialog.close();sync();if(question!==null&&question===input.value)submit();});
  privacyAck.addEventListener('click',()=>{privacyReviewed=true;privacyFirst.hidden=true;sync();input.focus({preventScroll:true});});
  panel.append(head,notice,scroll,form,privacyDialog);document.body.append(panel);
  const popover = node('div', undefined, { id: 'kt-ai-source-preview', class: 'kt-ai-source-popover', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'kt-ai-source-title' });
  popover.hidden = true;
  const previewHead = node('div', undefined, { class: 'kt-ai-source-head' });
  const previewTitle = node('h3', t('来源节选'), { id: 'kt-ai-source-title' });
  const previewClose = node('button', t('关闭'), { type: 'button', id: 'kt-ai-source-close', 'aria-label': t('关闭来源预览') });
  previewHead.append(previewTitle, previewClose);
  const previewMode = node('p', '', { class: 'kt-ai-note', id: 'kt-ai-source-mode' });
  const previewBody = node('div', undefined, { class: 'kt-ai-source-body', tabindex: '0', 'aria-label': t('来源节选内容') });
  const previewActions = node('div', undefined, { class: 'kt-ai-source-actions' });
  const read = node('button', t('阅读原文'), { type: 'button', id: 'kt-ai-source-read' });
  const full = node('a', t('打开完整攻略 ↗'), { target: '_blank', rel: 'noopener noreferrer', id: 'kt-ai-source-full' });
  previewActions.append(read, full); popover.append(previewHead, previewMode, previewBody, previewActions); panel.append(popover);
  const reader = node('section', undefined, { id: 'kt-ai-source-reader', class: 'kt-ai-source-reader', 'aria-label': t('来源阅读') });
  reader.hidden = true;
  const back = node('button', t('← 返回回答'), { type: 'button', id: 'kt-ai-source-back' });
  const sheetBackdrop = node('div', undefined, { id: 'kt-ai-source-backdrop', 'aria-hidden': 'true' });
  sheetBackdrop.hidden = true; panel.append(sheetBackdrop);
  const sheetHead = node('div', undefined, { class: 'kt-ai-sheet-head' });
  const sheetClose = node('button', t('关闭来源'), { type: 'button', id: 'kt-ai-source-sheet-close' });
  const sheetExpand = node('button', t('展开阅读'), { type: 'button', id: 'kt-ai-source-expand', 'aria-expanded': 'false' });
  const sheetLabel=node('span',t('来源节选'));
  sheetHead.append(sheetClose,sheetLabel,sheetExpand);
  const readerTitle = node('h3');
  const readerLocale = node('p', '', { class: 'kt-ai-note' });
  const readerText = node('div', undefined, { class: 'kt-ai-source-text' });
  const readerFull = node('a', t('打开完整攻略 ↗'), { target: '_blank', rel: 'noopener noreferrer' });
  const readerPrivacy=node('button',t('隐私与数据'),{type:'button',class:'kt-ai-text-button'});readerPrivacy.addEventListener('click',()=>privacyDialog.showModal());
  reader.append(sheetHead, back, readerTitle, readerLocale, readerText, readerFull,readerPrivacy); panel.insertBefore(reader, form);
  const searchDialog = document.getElementById('kt-search-dialog');
  const searchInput = document.getElementById('kt-search-input');
  const searchAI = node('button', t('问 AI · Beta'), { id: 'kt-search-ai-entry', type: 'button', 'aria-controls': 'kt-ai-panel' });
  if (searchDialog) {
    const bridge = node('div', undefined, { class: 'kt-ai-search-bridge' });
    const bridgeRow = node('div', undefined, { class: 'kt-ai-search-bridge-row' });
    bridgeRow.append(node('span', t('站内搜索')), searchAI);
    bridge.append(bridgeRow);
    searchDialog.querySelector('.kt-search-panel')?.prepend(bridge);
    searchAI.addEventListener('click', () => {
      const draft = searchInput?.value || '';
      const launch = () => openPanel({ origin: search, draft });
      if (searchDialog.open) { searchDialog.addEventListener('close', launch, { once: true }); searchDialog.close(); }
      else launch();
    });
  }
  let busy = true, serverBusy = false, ready = false, uncertain = false, trialState = null, current = null;
  let returnTarget = launcher, frozenPage = null;
  let activeSource = null, readerState = null, hideTimer = null, suppressedFocusTrigger = null, pointerFocusTrigger = null, citationNumber = 0;
  const transport = createModeTransport({followupAvailable:FOLLOWUP_MODE_AVAILABLE,onSession:onSnapshot,onStateChange:sync});
  singlePolicyNote.hidden=true;followupPolicyNote.hidden=false;contextPrivacy.hidden=false;privacyDialog.querySelector('p').textContent=t('启用 AI 问答后，问题和相关攻略材料会由 OpenAI 处理。追问正文仅临时保存30分钟；OpenAI 按其政策处理数据，不能保证零保留。请勿填写账号信息、密钥或其他敏感内容。');
  const cancelHide = () => { clearTimeout(hideTimer); hideTimer = null; };
  function restoreCitationFocus(trigger) {
    suppressedFocusTrigger = trigger;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  function dismissSource(restoreFocus = true) {
    cancelHide();
    const trigger = activeSource?.trigger;
    trigger?.setAttribute('aria-expanded', 'false');
    activeSource = null; popover.hidden = true;
    if (restoreFocus) restoreCitationFocus(trigger);
  }
  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(() => {
      if (!activeSource || popover.matches(':hover') || activeSource.trigger.matches(':hover')) return;
      // Mouse preview lifetime follows the pointer, even if an earlier action
      // left focus on the citation or scrolling content. Keyboard is separate.
      if (activeSource.kind === 'pointer' || !popover.contains(document.activeElement) && document.activeElement !== activeSource.trigger) dismissSource(false);
    }, 240);
  }
  function canonicalURL(value) { return transport.safeSourceURL(value); }
  function loadSources() {
    // The backend binds this question's verified excerpts or section links.
    return Promise.resolve(new Map([...transport.sources()].filter(([url, source]) => canonicalURL(url) && ['en','zh'].includes(source.locale) && typeof source.title === 'string' && (typeof source.text === 'string' || source.mappingType === 'section' || source.variants?.section))));
  }
  async function sourceFor(reference) {
    // A previous turn's citation keeps its own verified excerpt, even when
    // another turn cites a different excerpt from the same canonical page.
    const group=reference.source??(await loadSources()).get(canonicalURL(reference.url));
    return group?.variants?.[reference.mappingType??'excerpt']??group;
  }
  function placeSource() {
    if (!activeSource || popover.hidden) return;
    const anchor = activeSource.trigger.getBoundingClientRect();
    const minimum = head.getBoundingClientRect().top + 12;
    const maximum = Math.max(minimum, innerHeight - popover.getBoundingClientRect().height - 12);
    popover.style.top = Math.min(maximum, Math.max(minimum, anchor.top - 12)) + 'px';
  }
  async function showSource(trigger, reference, kind = 'pointer') {
    if (narrow.matches || readerState) return;
    cancelHide();
    if (activeSource?.trigger === trigger) { activeSource.kind = kind; return; }
    dismissSource(false);
    const state = { trigger, reference, kind, source: null };
    activeSource = state; trigger.setAttribute('aria-expanded', 'true');
    previewTitle.textContent = reference.label;
    const chapter=reference.mappingType==='section';
    previewMode.textContent = chapter?'中文对应章节':t('来源节选 · 点击引用可阅读原文');
    previewBody.hidden=chapter;read.textContent=t(chapter?'查看章节':'阅读原文');
    previewBody.replaceChildren(...(chapter?[]:[node('p', t('正在读取本题来源节选…'))]));
    previewBody.scrollTop = 0; read.disabled = true;
    full.href = canonicalURL(reference.url); popover.hidden = false; placeSource();
    const source = await sourceFor(reference);
    if (activeSource !== state) return;
    state.source = source || null;
    if (source) {
      previewTitle.textContent = source.title;
      const section=source.mappingType==='section';
      previewBody.hidden=section;previewBody.replaceChildren(...(section?[]:[node('div', source.text, { class: 'kt-ai-source-text' })]));
      previewMode.textContent = section?'中文对应章节':source.locale === 'zh' ? '来源节选 · 中文原文' : 'Source excerpt · English original';
      read.textContent=t(section?'查看章节':'阅读原文');
      read.disabled = false;
    } else {
      previewBody.replaceChildren(node('p', t('暂时无法显示这条来源的节选，可打开完整攻略核对。')));
    }
    placeSource();
  }
  async function openSourceReader(trigger, reference) {
    if (readerState) return;
    const state = { trigger, answerScroll: scroll.scrollTop, mobile: narrow.matches, inert: [] };
    readerState = state; dismissSource(false);
    reader.setAttribute('role', state.mobile ? 'dialog' : 'region');
    if (state.mobile) reader.setAttribute('aria-modal', 'true');
    trigger.setAttribute('aria-expanded', 'true');
    readerTitle.textContent = reference.label;
    const chapter=reference.mappingType==='section';
    sheetLabel.textContent=chapter?'中文对应章节':reference.locale==='zh'?'中文原文摘录':'Source excerpt';
    readerLocale.textContent = chapter?'中文对应章节':t('来源节选 · 本题引用的攻略资料');
    readerText.hidden=chapter;readerText.textContent = chapter?'':t('正在读取本题来源节选…'); readerFull.href = canonicalURL(reference.url);
    if (state.mobile) {
      state.inert = [head, notice, scroll, form].map(el => ({ el, was: el.hasAttribute('inert') }));
      state.inert.forEach(({ el }) => el.setAttribute('inert', ''));
      sheetBackdrop.hidden = false; panel.classList.add('kt-ai-source-open');
      reader.classList.remove('kt-ai-sheet-expanded'); sheetExpand.textContent = t('展开阅读'); sheetExpand.setAttribute('aria-expanded', 'false');
    } else scroll.hidden = true;
    reader.hidden = false; reader.scrollTop = 0;

    (state.mobile ? sheetClose : back).focus({ preventScroll: true });
    const source = await sourceFor(reference);
    if (readerState !== state) return;
    if (source) {
      readerTitle.textContent = source.title;
      const section=source.mappingType==='section';
      readerLocale.textContent = section?'中文对应章节':source.locale === 'zh' ? '来源节选 · 中文原文 · 本题引用的攻略资料' : 'Source excerpt · English original · Guide material cited for this question';
      readerText.hidden=section;readerText.textContent = section?'':source.text;
    } else readerText.textContent = t('暂时无法显示这条来源的节选，可打开完整攻略核对。');
  }
  function returnToAnswer(restoreFocus = true) {
    if (!readerState) return;
    const state = readerState; readerState = null;
    state.trigger.setAttribute('aria-expanded', 'false');
    heading.querySelector('h2').textContent = t('问攻略');
    state.inert.forEach(({ el, was }) => was ? el.setAttribute('inert', '') : el.removeAttribute('inert'));
    sheetBackdrop.hidden = true; panel.classList.remove('kt-ai-source-open'); reader.classList.remove('kt-ai-sheet-expanded');
    sheetExpand.textContent = t('展开阅读'); sheetExpand.setAttribute('aria-expanded', 'false');
    reader.hidden = true; scroll.hidden = false; scroll.scrollTop = state.answerScroll;
    reader.removeAttribute('aria-modal');
    if (restoreFocus) restoreCitationFocus(state.trigger);
  }
  previewClose.addEventListener('click', () => dismissSource());
  popover.addEventListener('pointerenter', cancelHide);
  popover.addEventListener('pointerleave', scheduleHide);
  popover.addEventListener('focusin', () => activeSource?.kind === 'keyboard' ? cancelHide() : scheduleHide());
  popover.addEventListener('focusout', scheduleHide);
  popover.addEventListener('keydown', () => { if (activeSource) { activeSource.kind = 'keyboard'; cancelHide(); } });
  read.addEventListener('click', () => {
    if (activeSource) openSourceReader(activeSource.trigger, activeSource.reference);
  });
  back.addEventListener('click', () => returnToAnswer());
  sheetClose.addEventListener('click', () => returnToAnswer());
  sheetBackdrop.addEventListener('click', () => returnToAnswer());
  sheetExpand.addEventListener('click', () => {
    const expanded = reader.classList.toggle('kt-ai-sheet-expanded');
    sheetExpand.textContent = expanded ? t('收起阅读') : t('展开阅读'); sheetExpand.setAttribute('aria-expanded', String(expanded));
  });
  scroll.addEventListener('scroll', () => dismissSource(false));
  function limitReason(){return trialState?.ready?'':t(availabilityText(trialState)??descriptions[trialState?.code])||t('暂未接收请求；可继续阅读攻略。');}
  function sync(){
    const state=transport.state(),pilot=trialState?.beta?.pilot;
    const followup=transport.mode()==='followup';notice.dataset.entry=followup?'followup':state.singleConsent?'single-fallback':'single-recovery';
    entryLabel.textContent=t(followup?'Limited Follow-up · 主问＋2次追问':state.singleConsent?'一次性单轮备用：不继承追问上下文。':'旧单轮请求：仅查询或取消，不会自动发送新题。');
    fallbackChoice.hidden=!followup||!state.fallbackAvailable;fallbackChoice.disabled=busy||state.busy||state.probing;
    primaryChoice.hidden=followup;primaryChoice.disabled=busy||state.busy||!!state.activeId||state.uncertain||state.pendingOther;
    pendingChoice.hidden=!state.pendingOther;pendingChoice.disabled=busy||state.busy;
    singlePolicyNote.hidden=followup;followupPolicyNote.hidden=!followup;contextPrivacy.hidden=!followup;
    const lengths=updateLength();
    const stopping=cancelling||sending||!!state.activeId;
    send.dataset.action=stopping?'stop':'send';
    const accessible=cancelling?t('正在请求停止'):stopping?t('停止回答'):t(transport.mode()==='followup'&&trialState?.followup?.completedTurns?'发送追问':'发送问题');
    send.setAttribute('aria-label',accessible);send.title=accessible;send.setAttribute('aria-busy',String(cancelling));
    send.disabled=stopping?cancelling||!trialState?.authenticated||!state.activeId:busy||state.busy||state.uncertain||state.pendingOther||!trialState?.authenticated||trialState?.beta?.approved!==true||!ready||pilot?.configured!==true||pilot.used===true||pilot.poolRemaining===0||pilot.rolling24hAvailable===false||composing||lengths.over||!input.value.trim();
    input.readOnly=sending||cancelling||state.busy;
    input.disabled=transport.mode()==='followup'&&trialState?.followup?.closed===true;endGroup.disabled=busy||state.busy||state.uncertain||!!state.activeId;
    searchAI.disabled=sending||cancelling||state.busy;
    query.hidden=!state.activeId||(!manualCheckNeeded&&!state.uncertain&&sending);
    query.disabled=cancelling||!trialState?.authenticated;
    renderAccount();
    empty.hidden=!result.hidden;result.setAttribute('aria-busy',String(sending||cancelling));
  }
  function updateLength(){
    const lengths=questionLengths(input.value);
    const hint=lengths.over?t('问题过长，请精简后发送'):lengths.near?t('即将达到上限'):t('已输入 {length}',{length:lengths.utf16});
    lengthCounter.hidden=document.activeElement!==input&&!input.value.length;
    lengthCounter.dataset.state=lengths.over?'over':lengths.near?'near':'normal';
    lengthCounter.textContent=hint;
    const details=t('已输入 {length}（按 UTF-16 单位计数）。是否可发送取决于实际处理容量。',{length:lengths.utf16});
    lengthCounter.title=details+(lengths.over||lengths.near?' '+hint:'');lengthCounter.setAttribute('aria-label',lengthCounter.title);lengthHelp.textContent=lengthCounter.title;
    input.setAttribute('aria-invalid',String(lengths.over));
    return lengths;
  }
  function sizeInput(){input.style.height='auto';input.style.height=Math.min(184,Math.max(112,input.scrollHeight))+'px';if(document.activeElement===input&&input.selectionEnd===input.value.length)input.scrollTop=input.scrollHeight;}
  function position() {
    const bottom = document.getElementById('quarto-header')?.getBoundingClientRect().bottom || 68.3;
    panel.style.setProperty('--kt-ai-top', Math.max(0, bottom) + 'px');
    if (narrow.matches) {
      const viewport = window.visualViewport;
      panel.style.setProperty('--kt-ai-mobile-top', (viewport?.offsetTop || 0) + 'px');
      panel.style.setProperty('--kt-ai-mobile-height', (viewport?.height || innerHeight) + 'px');
    }
  }
  function placeLauncher() {
    const mobileRow = document.getElementById('kt-mobile-header-row');
    mobileRow?.classList.toggle('kt-ai-mobile-entry', narrow.matches);
    if (narrow.matches && mobileRow) mobileRow.insertBefore(launcher, document.getElementById('kt-page-toc-trigger'));
    else search.after(launcher);
    launcher.firstElementChild.textContent = narrow.matches ? 'AI' : t('AI 问攻略');
    launcher.setAttribute('aria-label', t('AI 问攻略（Open Beta）'));

  }
  function freezePage() {
    if (frozenPage) return;
    frozenPage = { x: scrollX, y: scrollY, styles: {}, inert: [] };
    for (const name of ['position', 'top', 'left', 'width', 'overflow']) frozenPage.styles[name] = document.body.style[name];
    for (const el of document.body.children) if (el !== panel && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) {
      frozenPage.inert.push({ el, was: el.hasAttribute('inert') }); el.setAttribute('inert', '');
    }
    document.body.style.position = 'fixed'; document.body.style.top = -frozenPage.y + 'px'; document.body.style.left = -frozenPage.x + 'px'; document.body.style.width = '100%'; document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('kt-ai-mobile-modal-open'); document.body.classList.add('kt-ai-mobile-modal-open');
  }
  function releasePage() {
    if (!frozenPage) return;
    const saved = frozenPage; frozenPage = null;
    for (const [name, value] of Object.entries(saved.styles)) document.body.style[name] = value;
    saved.inert.forEach(({ el, was }) => was ? el.setAttribute('inert', '') : el.removeAttribute('inert'));
    document.documentElement.classList.remove('kt-ai-mobile-modal-open'); document.body.classList.remove('kt-ai-mobile-modal-open');
    window.scrollTo(saved.x, saved.y);
  }
  function openPanel({ origin = launcher, draft } = {}) {
    if (panel.hidden) {
      returnTarget = origin;
      if (narrow.matches) {
        document.getElementById('kt-page-toc-close')?.click(); document.getElementById('kt-global-nav-close')?.click();
        freezePage();
      }
    }
    if (draft !== undefined && !busy && !serverBusy) {
      dismissSource(false); returnToAnswer(false); input.value = draft; sizeInput();sync();
      status.textContent = draft.trim() ? t('已带入搜索文字') : '';
    }
    preserveReading(() => {
      panel.hidden = false; document.body.classList.add('kt-ai-open'); launcher.setAttribute('aria-expanded', 'true');
      panel.setAttribute('role', narrow.matches ? 'dialog' : 'complementary');
      if (narrow.matches) panel.setAttribute('aria-modal', 'true'); else panel.removeAttribute('aria-modal');
      position(); (narrow.matches ? close : input).focus({ preventScroll: true });
    });
    if(transport.mode()==='followup'&&latestScrollPending)scrollToLatestQuestion();
    if (!busy) recover();
  }
  function closePanel() {
    dismissSource(false); returnToAnswer(false);
    preserveReading(() => {
      panel.hidden = true; document.body.classList.remove('kt-ai-open'); launcher.setAttribute('aria-expanded', 'false');
      panel.removeAttribute('aria-modal'); releasePage();
      (returnTarget?.isConnected ? returnTarget : launcher).focus({ preventScroll: true });
    });
  }
  launcher.addEventListener('click', () => panel.hidden ? openPanel() : closePanel());
  close.addEventListener('click', closePanel);
  document.addEventListener('keydown', event => {
    if(document.getElementById('kt-beta-application')?.open)return;
    if(privacyDialog.open&&event.key!=='Tab')return;
    if (event.key === 'Tab' && !panel.hidden && (narrow.matches||privacyDialog.open)) {
      const layer = privacyDialog.open ? privacyDialog : readerState ? reader : panel;
      const focusable = [...layer.querySelectorAll('button,a[href],input,textarea,summary,[tabindex]')].filter(el => !el.disabled && el.getClientRects().length && !el.closest('[hidden],[inert]') && el.tabIndex >= 0);
      const index = focusable.indexOf(document.activeElement);
      if (focusable.length) {
        event.preventDefault();
        const next=index<0?(event.shiftKey?focusable.length-1:0):(index+(event.shiftKey?-1:1)+focusable.length)%focusable.length;
        focusable[next].focus();
      }
    }
    if (event.key === 'Escape' && !event.defaultPrevented && !panel.hidden && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      if (activeSource) dismissSource();
      else if (readerState) returnToAnswer();
      else closePanel();
    }
  });
  narrow.addEventListener('change', () => { if (!panel.hidden) closePanel(); placeLauncher(); position(); });
  window.addEventListener('resize', () => { position(); if (!narrow.matches) placeSource(); });
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  new ResizeObserver(position).observe(document.getElementById('quarto-header'));
  input.addEventListener('input',()=>{sizeInput();sync();});
  input.addEventListener('focus',updateLength);
  input.addEventListener('blur',updateLength);
  input.addEventListener('compositionstart',()=>{composing=true;sync();});
  input.addEventListener('compositionend',()=>{composing=false;compositionEndedAt=performance.now();sync();});
  input.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||narrow.matches||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||composing||event.keyCode===229||performance.now()-compositionEndedAt<100)return;
    event.preventDefault();submit();
  });
  function safeLink(reference) {
    if (!canonicalURL(reference.url) || !transport.sources().has(reference.url)) return null;
    const button = node('button', (reference.locale==='zh'?(reference.mappingType==='section'?'章节：':'来源：'):'Source: ') + reference.label, { type: 'button', class: 'kt-ai-citation', id: 'kt-ai-citation-' + (++citationNumber), 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'kt-ai-source-preview kt-ai-source-reader', title: t('悬停预览；点击阅读原文；按 ↓ 进入预览') });
    button.addEventListener('pointerenter', () => showSource(button, reference, 'pointer'));
    button.addEventListener('pointerleave', scheduleHide);
    button.addEventListener('pointerdown', () => { pointerFocusTrigger = button; });
    button.addEventListener('pointerup', () => { pointerFocusTrigger = null; });
    button.addEventListener('pointercancel', () => { pointerFocusTrigger = null; });
    button.addEventListener('focus', () => { if (suppressedFocusTrigger !== button && pointerFocusTrigger !== button) showSource(button, reference, 'keyboard'); });
    button.addEventListener('blur', () => { if (suppressedFocusTrigger === button) suppressedFocusTrigger = null; scheduleHide(); });
    button.addEventListener('click', () => { pointerFocusTrigger = null; openSourceReader(button, reference); });
    button.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); showSource(button, reference, 'keyboard'); previewClose.focus({ preventScroll: true }); } });
    return button;
  }
  let contextExpiryTimer=null,displayedCid=null,contextExpired=false,latestScrollPending=false;
  function scrollToLatestQuestion() {
    if(panel.hidden||scroll.hidden){latestScrollPending=true;return;}
    const question=[...result.querySelectorAll('.kt-ai-question')].at(-1);
    if(question){scroll.scrollTop+=question.getBoundingClientRect().top-scroll.getBoundingClientRect().top-12;latestScrollPending=false;}
  }
  const drafts=new Map(),draftKey=()=>transport.mode();
  async function changeEntry(action){
    if(busy||transport.state().busy)return;
    const oldKey=draftKey(),draft=input.value;drafts.set(oldKey,draft);clearQuestion();busy=true;sync();
    try{await action();contextExpired=false;clearTimeout(contextExpiryTimer);displayedCid=null;privacyDialog.querySelector('p').textContent=transport.mode()==='followup'?t('启用 AI 问答后，问题和相关攻略材料会由 OpenAI 处理。追问正文仅临时保存30分钟；OpenAI 按其政策处理数据，不能保证零保留。请勿填写账号信息、密钥或其他敏感内容。'):privacyCopy;input.value=drafts.get(draftKey())??'';privacyReviewed=false;privacyFirst.hidden=false;manualCheckNeeded=!!transport.state().activeId;}
    catch(error){input.value=draft;status.textContent=error.message==='FALLBACK_UNAVAILABLE'?t('单轮备用当前不可用，请重新读取资格。'):t(descriptions[error.message]??'本组状态待确认，请查看进度；不会自动重发。');}
    finally{busy=false;sizeInput();sync();}
  }
  fallbackChoice.addEventListener('click',()=>changeEntry(()=>transport.chooseFallback()));
  primaryChoice.addEventListener('click',()=>changeEntry(()=>transport.returnToFollowup()));
  pendingChoice.addEventListener('click',()=>changeEntry(()=>transport.recoverOther()));
  endGroup.addEventListener('click',async()=>{try{contextExpired=false;await transport.endConversation();clearQuestion();await refreshSnapshot();}catch{status.textContent=t('本组状态待确认，请查看进度；不会自动重发。');}});
  let userId=null,renderGeneration=0,resultGeneration=0,pendingActions=0;
  function clearQuestion(){resultGeneration++;latestScrollPending=false;dismissSource(false);returnToAnswer(false);current=null;input.value='';sizeInput();result.replaceChildren();result.hidden=true;status.textContent='';manualCheckNeeded=false;transport.clearSources();}
  function onSnapshot(state){
    if(state!==null&&(typeof state?.authenticated!=='boolean'||state.httpStatus!==undefined&&state.httpStatus!==200))throw Error('SESSION_UNAVAILABLE');
    const priorGroup=trialState?.followup;const next=state?.user?.id??null;
    if(next!==userId){drafts.clear();contextExpired=false;renderGeneration++;clearQuestion();privacyReviewed=false;privacyFirst.hidden=false;}userId=next;
    sessionPhase=state===null?'checking':'known';
    trialState=state;ready=state?.ready===true;serverBusy=!!state?.activeRequestId;
    clearTimeout(contextExpiryTimer);
    if(transport.mode()==='followup'){
      if(priorGroup&&!state?.followup&&Date.now()>=priorGroup.expiresAt)contextExpired=true;
      if(displayedCid&&displayedCid!==state?.followup?.id)clearQuestion();displayedCid=state?.followup?.id??null;
      if(state?.followup)contextExpiryTimer=setTimeout(()=>{contextExpired=true;clearQuestion();status.textContent=t('本组已到期，临时上下文已清除');refreshSnapshot();},Math.max(1,state.followup.expiresAt-Date.now()));
      if(!current&&state?.followup?.history?.length&&!state.activeRequestId){const h=state.followup.history.at(-1);current={question:h.question};render(transport.projectHistory(h.response));}
    }
    sync();if(contextExpired&&transport.mode()==='followup'&&state?.authenticated)status.textContent=t('本组已到期，临时上下文已清除');
  }
  function renderAccount(){
    const state=trialState,authenticated=sessionPhase==='known'&&state?.authenticated===true,pilot=state?.beta?.pilot;
    notice.dataset.sessionPhase=sessionPhase;notice.dataset.authenticated=String(authenticated);
    notice.dataset.available=String(authenticated&&state.ready===true&&pilot?.used!==true);
    const publicApply=document.getElementById('kt-beta-apply-entry');
    if(publicApply)publicApply.hidden=true;
    google.hidden=true;gis.hidden=true;logout.hidden=true;sessionRetry.hidden=true;permission.hidden=true;modeCheck.hidden=true;funds.hidden=true;account.hidden=true;betaApply.hidden=true;
    modeCheck.textContent='';budget.textContent='';
    if(sessionPhase==='access'){
      identity.textContent='Open Beta';permission.hidden=false;permission.textContent=t('登录暂不可用，请稍后重试。');
      account.hidden=false;google.hidden=false;google.disabled=!['ready','retry','error'].includes(googlePhase);
      betaApply.hidden=true;
      if(googleMessage){modeCheck.hidden=false;modeCheck.textContent=googleMessage;}
      dismissSource(false);returnToAnswer(false);result.hidden=!(transport.mode()==='followup'&&sessionPhase==='checking'&&current);return;
    }
    if(sessionPhase!=='known'){
      identity.textContent=sessionPhase==='checking'?(loggingOut?t('正在确认退出状态…'):t('正在确认登录…')):t('无法读取账户状态');
      if(sessionPhase==='error'){account.hidden=false;sessionRetry.hidden=false;modeCheck.hidden=false;modeCheck.textContent=t('尚不能确认当前账户，请重试。');}
      dismissSource(false);returnToAnswer(false);result.hidden=!(transport.mode()==='followup'&&sessionPhase==='checking'&&current);return;
    }
    if(current&&result.childNodes.length)result.hidden=false;
    account.hidden=false;permission.hidden=false;
    betaApply.hidden=true;
    if(!authenticated){
      identity.textContent=t('尚未登录');permission.textContent=t('Google 登录后即可获得公开试用资格');
      gis.hidden=!gis.childElementCount;google.hidden=!!gis.childElementCount;
      google.disabled=!['ready','retry','error'].includes(googlePhase);google.title=googleMessage||t('Google 登录');
      if(googleMessage){modeCheck.hidden=false;modeCheck.textContent=googleMessage;}
      return;
    }
    logout.hidden=false;
    identity.textContent=state.beta?.approved===true?t('已登录 · 可公开试用'):t('已登录');
    if(transport.mode()==='followup'){
      identity.textContent=t('已登录');const group=state.followup;endGroup.hidden=!group;
      permission.textContent=state.beta?.approved!==true?t(descriptions[state.code]??'暂时无法确认试用资格'):group?group.closed?t(group.completedTurns>=3?'本组三次交互已结束':'本组请求尝试已用完'):t('已完成 {count}/3 次 · 可继续 {remaining} 次',{count:group.completedTurns,remaining:group.remaining}):state.ready?t('可发送主问；之后最多追问两次。'):t(descriptions[state.code]??'Limited Follow-up 尚未开放');
      funds.hidden=false;budget.textContent=t('本组剩余 {units}/3000 处理额度，不自动补充。',{units:state.allowance?.balance??0});
      if(group&&!group.closed&&!state.ready&&state.code){modeCheck.hidden=false;modeCheck.textContent=limitReason();}
      input.placeholder=t(group?.closed?'本组三次交互已结束':group?.completedTurns?'继续追问，可省略已说明的条件':'想了解什么？');return;
    }
    endGroup.hidden=true;
    const ended=availabilityText(state)==='本轮测试已结束';
    permission.textContent=state.beta?.approved!==true?t(descriptions[state.code]??'暂时无法确认试用资格'):ended?t('本轮测试已结束'):!pilot?.configured?t('AI 问答尚未开放'):pilot.used?t('账户剩余 0 题'):pilot.poolRemaining===0?t('全站试用题数已用完'):t('账户剩余 {count} 题 · 全站剩余 {pool} 题',{count:Number.isInteger(pilot.remainingQuestions)?pilot.remainingQuestions:1,pool:Number.isInteger(pilot.poolRemaining)?pilot.poolRemaining:5});
    const shown=percentage(state.allowance?.percentage);funds.hidden=shown===null;
    budget.textContent=shown===null?'':t('可用处理额度约 {percent}%；已发送的问题不会恢复试用题数，额度不会自动补充。',{percent:shown});
    if(state.beta?.approved===true&&pilot?.configured&&!pilot.used&&state.code&&state.code!=='AUTH_REQUIRED'){
      modeCheck.hidden=false;modeCheck.textContent=ended?t('可继续阅读攻略或使用站内搜索。'):limitReason();
    }
  }
  function appendAnswerContent(parent,answer) {
    if (typeof answer.text === 'string' && answer.text) parent.append(node('p', answer.text));
    for (const segment of answer.segments || []) {
      if (typeof segment.text !== 'string') continue;
      parent.append(node('p', segment.text));
      const links = node('div', undefined, { class: 'kt-ai-reference' });
      for (const ref of segment.references || []) { const link = safeLink(ref); if (link) links.append(link); }
      if (links.childNodes.length) parent.append(links);
    }
    if (typeof answer.note === 'string' && answer.note) parent.append(node('p', answer.note, { class: 'kt-ai-note' }));
    if (typeof answer.scope === 'string' && answer.scope) parent.append(node('p', answer.scope, { class: 'kt-ai-note' }));
  }
  function appendCompletedHistory(excludeRequestId) {
    if(transport.mode()!=='followup')return;
    for(const h of trialState?.followup?.history??[]) {
      if(excludeRequestId!==undefined&&h.requestId===excludeRequestId)continue;
      const block=node('div',undefined,{class:'kt-ai-history-turn'});
      block.append(node('p',h.question,{class:'kt-ai-question'}));
      appendAnswerContent(block,transport.projectHistory(h.response));
      result.append(block);
    }
  }
  function waiting(question) {
    dismissSource(false); returnToAnswer(false);
    current = Object.freeze({ question });
    result.hidden = false; result.dataset.state = 'waiting';
    result.replaceChildren();appendCompletedHistory();
    const currentQuestion=node('p', question, { class: 'kt-ai-question' });
    result.append(currentQuestion, node('h3', t('正在整理回答…'), { id: 'kt-ai-stage' }), node('p', '', { id: 'kt-ai-wait' }), node('p', t('可以点击输入框右下角停止。关闭面板后仍会继续处理。'), { class: 'kt-ai-note' }));
    if(transport.mode()==='followup')scrollToLatestQuestion();else scroll.scrollTop = Math.max(0, result.offsetTop - scroll.offsetTop - 12);
  }
  function render(answer) {
    const allowed = ['answer','missing','failure','limited','cancelled','timeout','refused','offtopic','clarification'];
    if (!answer || !allowed.includes(answer.status)) answer = connectionFailure(t('回答暂未就绪，请查看进度。问题不会自动重发。'));
    dismissSource(false); returnToAnswer(false);
    result.hidden = false; result.dataset.state = answer.status;
    result.replaceChildren();
    appendCompletedHistory(answer.raw?.requestId);
    const currentQuestion=node('p', current?.question || t('当前问题'), { class: 'kt-ai-question' });result.append(currentQuestion);
    const labels = { 'qb1-product':t('基于攻略来源'), 'host-no-evidence': t('暂未找到可核对的攻略材料'), 'host-service-failure': answer.status === 'limited' ? t('提问暂不可用') : t('连接或处理未完成') };
    result.append(node('p', labels[answer.provenance] || t('本题处理状态'), { class: 'kt-ai-result-label' }), node('h3', ({'本题回答':t('回答'),'本题未完成':t('这次未能完成'),'本题状态待确认':t('结果待确认'),'本题已取消':t('已停止'),'暂未接收本题':t('暂时无法提问')})[answer.title]||t(answer.title)||t('处理状态')));
    appendAnswerContent(result,answer);
    const kinds = { question_cap: t('本轮问题数量上限'), call_cap: t('AI 问答暂时不可用'), time_cap: t('本轮测试已结束'), inflight: t('正在处理上一题'), input: t('输入需要调整'), sensitive_input: t('请移除密钥或认证信息'), local_cap: t('本轮暂时无法继续提问') };
    if (answer.status === 'limited' && kinds[answer.kind]) result.append(node('p', kinds[answer.kind], { class: 'kt-ai-note' }));
    uncertain = answer.kind === 'local_connection';
    if (uncertain) result.append(node('p', t('请查看进度确认结果。确认前不会再次发送问题。'), { class: 'kt-ai-note' }));
    status.textContent = answer.serviceStatus || (answer.status === 'answer' ? t('本题回答已返回') : (typeof answer.title === 'string' ? t(answer.title) : t('本题处理未完成')));
    if(transport.mode()==='followup')scrollToLatestQuestion();else scroll.scrollTop = Math.max(0, result.offsetTop - scroll.offsetTop - 12);
  }
  function connectionFailure(text) {
    return { status: 'failure', provenance: 'host-service-failure', title: t('连接未完成'), text, segments: [], kind: 'local_connection' };
  }
  async function refreshSnapshot(){sessionPhase='checking';ready=false;sync();try{return await transport.snapshot();}catch(error){sessionPhase=error.message==='ACCESS_REQUIRED'?'access':'error';trialState=null;ready=false;sync();return null;}}
  async function run(action,kind){
    const generation=renderGeneration,ownResult=++resultGeneration;pendingActions++;busy=true;
    if(kind==='send'){sending=true;manualCheckNeeded=false;status.textContent=t('正在整理回答…');}
    if(kind==='cancel'){cancelling=true;status.textContent=t('正在请求停止…');const title=result.querySelector('h3');if(title)title.textContent=t('正在请求停止…');}
    sync();
    try{
      const answer=await action();
      if(generation===renderGeneration&&ownResult===resultGeneration){
        if(kind==='cancel'&&['cancelled','completed','failed','rejected'].includes(answer.raw?.status))sending=false;
        render(answer);if(kind==='send'&&transport.mode()==='followup'&&answer.raw?.status==='completed'){input.value='';sizeInput();}
        manualCheckNeeded=!!transport.state().activeId;
        status.textContent=answer.serviceStatus||(answer.raw?.status==='cancelled'?t('已停止 · 结算结果见上方'):answer.raw?.status==='completed'?t('回答已完成'):kind==='cancel'&&manualCheckNeeded?t('停止结果待确认，请查看进度'):feedbackFor(answer.raw||answer,trialState));
        if(!transport.state().activeId)await refreshSnapshot();
      }
    }catch(error){
      if(generation===renderGeneration&&ownResult===resultGeneration){if(kind==='send'&&transport.mode()==='followup')render(connectionFailure(t('连接未完成，请查看进度；不会自动重发。')));manualCheckNeeded=!!transport.state().activeId;status.textContent=kind==='cancel'?t('停止结果待确认，请查看进度'):t(descriptions[error.message])||t('连接未完成，请查看进度；不会自动重发。');if(kind==='cancel'){const title=result.querySelector('h3');if(title)title.textContent=t('停止结果待确认');}}
    }finally{if(kind==='send')sending=false;if(kind==='cancel')cancelling=false;pendingActions--;busy=pendingActions>0;sync();}
  }
  async function recover(initial=false){
    if(busy&&!initial)return;
    busy=true;sync();const snapshot=await refreshSnapshot();busy=false;
    if(snapshot&&transport.state().activeId){manualCheckNeeded=true;status.textContent=t('有结果待确认，请查看进度。');}sync();
  }
  async function submit(){if(send.dataset.action!=='send'||send.disabled)return;const question=input.value;if(questionLengths(question).over){sync();return;}if(!questionLanguage(question)){status.textContent=languageClarification;return;}if(!privacyReviewed){openPrivacy(true);return;}waiting(question);await run(()=>transport.send(question),'send');}
  form.addEventListener('submit',event=>{event.preventDefault();submit();});
  send.addEventListener('click',()=>send.dataset.action==='stop'?stop():submit());
  async function stop(){if(send.disabled||cancelling)return;await run(()=>transport.cancel(),'cancel');}
  query.addEventListener('click',()=>run(()=>transport.queryStatus(),'query'));
  sessionRetry.addEventListener('click',()=>recover());
  logout.addEventListener('click',async()=>{loggingOut=true;clearQuestion();try{await transport.logout();const snapshot=await refreshSnapshot();status.textContent=snapshot?.authenticated===false?t('已退出登录，本页正文已清除。'):t('退出状态待确认；本页正文已清除。');}catch{sessionPhase='error';trialState=null;ready=false;status.textContent=t('退出状态待确认；本页正文已清除。');sync();}finally{loggingOut=false;}});
  let googleAttempt=null;
  window.KTProductGoogle=Object.freeze({requiresAccess:()=>false,prepare:async()=>{googleAttempt=await transport.nonce();return {nonce:googleAttempt.nonce};},complete:async credential=>{const attempt=googleAttempt;googleAttempt=null;if(!attempt?.csrf)throw Error('GOOGLE_NONCE_REQUIRED');sessionPhase='checking';ready=false;sync();try{return await transport.loginGoogle(credential,attempt.csrf);}catch(error){sessionPhase='error';trialState=null;sync();throw error;}},onUIStatus:({phase,message=''})=>{googlePhase=phase;googleMessage=message;sync();},refreshUI:()=>sync()});
  window.addEventListener('focus',()=>{if(sessionPhase==='access'&&!busy)recover();});
  placeLauncher();sync();recover(true);
})();
