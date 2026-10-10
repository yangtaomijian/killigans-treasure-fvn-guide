// Reuse the private-feedback transport and existing modal styles.
// No Google, QB1, membership, ledger, Access, window, or provider operation.
(() => {
  const runtime=window.__ktDiscussionRuntime,context=runtime?.getContext();
  const links=document.querySelector('footer.footer .kt-publication-footer-links');
  if(!links||!context||document.getElementById('kt-beta-apply-entry'))return;
  const en=context.locale==='en',w=en?{
    entry:'Apply for Beta',title:'Apply for Closed Beta',close:'Close',
    intro:'Want to try Ask the Guide? The site owner reviews applications manually and emails instructions to approved applicants. Using AI requires signing in with Google.',
    contact:'Contact email',contactHelp:'Use an email you can receive replies at. Your application email is handled separately from your later Google sign-in identity.',
    interest:'What would you like to test? (optional)',interestHelp:'Briefly describe the guide questions you would like to try. Up to 500 characters.',
    privacy:'Your application is sent privately to the site owner through the existing feedback channel. It is not posted in Discussion or sent to OpenAI.',
    retention:'The site owner manually removes application emails within 30 days of receipt. This is an operating procedure, not automatic deletion. Beta identity and accounting records follow their existing rules.',
    limit:'Applying does not grant access, use a question or start a Beta round. If approved, the site owner will explain the next steps by email.',
    contactError:'Enter an email you can receive replies at (up to 200 characters).',interestError:'Keep your note to 500 characters or fewer.',
    send:'Send application',cancel:'Cancel',sending:'Sending application…',verify:'Complete verification before sending.',
    verifyLoad:'Verification could not load. Your draft is still here.',verifyRetry:'Retry verification',
    success:'Application sent and awaiting manual review. If approved, the site owner will contact you at your application email.',
    rate:'Too many submissions. Your draft is still here. Wait before trying again.',
    failedVerify:'Verification failed. Your draft is still here. Verify again before retrying.',
    unavailable:'The application service is unavailable. Your draft is still here.',
    uncertain:'Delivery could not be confirmed. Your draft is still here. Avoid submitting again until you have checked whether it arrived.',
    local:'Applications are temporarily unavailable. Please try again later.'
  }:{
    entry:'申请 Beta',title:'申请 Closed Beta',close:'关闭',
    intro:'想试用「问攻略」？申请由站长人工审核，获准后会通过邮件发送说明。实际使用 AI 必须通过 Google 登录。',
    contact:'联系邮箱',contactHelp:'请填写可以收信的邮箱。申请邮箱与之后的 Google 登录身份分开处理。',
    interest:'想测试什么？（可选）',interestHelp:'简要说明想尝试的攻略问题，最多 500 个字符。',
    privacy:'申请通过现有反馈通道私下发给站长，不显示在讨论区，也不会发送给 OpenAI。',
    retention:'申请邮件由站长在收到后 30 天内人工清理，这是运营安排，不是自动删除。Beta 身份与账务记录沿用现有规则。',
    limit:'申请不等于获准测试，不消耗问答次数，也不会开启测试窗口。获准后，站长会通过邮件说明后续步骤。',
    contactError:'请填写可以收信的邮箱，最多 200 个字符。',interestError:'测试意向请控制在 500 个字符以内。',
    send:'发送申请',cancel:'取消',sending:'正在发送申请…',verify:'请先完成验证，再发送。',
    verifyLoad:'验证组件无法加载，已保留填写内容。',verifyRetry:'重试验证',
    success:'申请已发送，等待人工审核。如获批准，站长将通过申请邮箱联系你。',
    rate:'提交过于频繁，已保留填写内容，请稍后再试。',
    failedVerify:'验证失败，已保留填写内容，请重新验证后再试。',
    unavailable:'申请服务暂不可用，已保留填写内容。',
    uncertain:'暂时无法确认是否送达，已保留填写内容。请先确认是否收到，再决定是否重新提交。',
    local:'申请服务暂时不可用，请稍后再试。'
  };
  const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
  const button=(text,className)=>{const e=node('button',text,className);e.type='button';return e;};
  const entry=node('a',w.entry,'kt-feedback-slot');entry.id='kt-beta-apply-entry';entry.href=(en?'/en':'')+'/help.html#ask-guide-beta';
  const feedback=links.querySelector('.kt-feedback-slot');feedback?feedback.after(entry):links.append(entry);
  const dialog=node('dialog',undefined,'kt-feedback-dialog');dialog.id='kt-beta-application';dialog.setAttribute('aria-labelledby','kt-beta-application-title');
  const title=node('h2',w.title);title.id='kt-beta-application-title';
  const close=button(w.close,'kt-feedback-close'),header=node('div',undefined,'kt-feedback-header');header.append(title,close);
  const intro=node('p',w.intro,'kt-feedback-intro'),status=node('p','','kt-feedback-status');status.id='kt-beta-application-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const form=node('form',undefined,'kt-feedback-form');form.noValidate=true;
  function field(id,label,help,tag){
    const row=node('div',undefined,'kt-feedback-field'),l=node('label',label);l.htmlFor=id;
    const input=node(tag,undefined,'kt-feedback-input');input.id=id;
    const h=node('p',help,'kt-feedback-help');h.id=id+'-help';const error=node('p','','kt-feedback-field-error');error.id=id+'-error';
    input.setAttribute('aria-describedby',h.id+' '+error.id);row.append(l,input,h,error);return {row,input,error};
  }
  const contact=field('kt-beta-contact',w.contact,w.contactHelp,'input');contact.input.type='email';contact.input.required=true;contact.input.autocomplete='email';
  const interest=field('kt-beta-interest',w.interest,w.interestHelp,'textarea');interest.input.rows=3;
  const honeypot=node('input',undefined,'kt-feedback-honeypot');honeypot.type='text';honeypot.name='website';honeypot.tabIndex=-1;honeypot.autocomplete='off';honeypot.setAttribute('aria-hidden','true');
  const privacy=node('p',w.privacy,'kt-feedback-help'),limit=node('p',w.limit,'kt-feedback-help');
  const data=node('details');const summary=node('summary',en?'Application data':'申请数据');data.append(summary,node('p',w.retention,'kt-feedback-help'));
  const verification=node('div',undefined,'kt-feedback-turnstile');verification.id='kt-beta-verification';
  const retry=button(w.verifyRetry,'kt-feedback-action');retry.hidden=true;
  const submit=button(w.send,'kt-feedback-action kt-feedback-submit');submit.id='kt-beta-submit';submit.type='submit';submit.disabled=true;
  const cancel=button(w.cancel,'kt-feedback-action'),actions=node('div',undefined,'kt-feedback-actions');actions.append(submit,cancel);
  form.append(contact.row,interest.row,honeypot,privacy,limit,data,verification,retry,actions);dialog.append(header,intro,status,form);document.body.append(dialog);
  const transport=['production','fixture'].includes(runtime.mode)?runtime.transport:null;
  const points=s=>Array.from(s).length;
  let token=null,widget=null,generation=0,sending=false,succeeded=false,opener=entry,scriptPromise=null,wasInert=false;
  function sync(){submit.disabled=sending||succeeded||!token;close.disabled=sending;cancel.disabled=sending;retry.disabled=sending;contact.input.readOnly=sending;interest.input.readOnly=sending;}
  function clearVerification(){generation++;token=null;if(widget!==null&&window.turnstile){try{window.turnstile.remove(widget);}catch{}}widget=null;verification.replaceChildren();sync();}
  function loadVerification(){
    if(window.turnstile)return Promise.resolve(window.turnstile);
    // Actual loopback has neither a remote transport nor a verification bypass.
    if(runtime.mode!=='production')return Promise.reject(Error('LOCAL_PREVIEW'));
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
      const timer=setTimeout(()=>{script.remove();reject(Error('VERIFICATION_UNAVAILABLE'));},10000);
      script.onload=()=>{clearTimeout(timer);window.turnstile?resolve(window.turnstile):reject(Error('VERIFICATION_UNAVAILABLE'));};
      script.onerror=()=>{clearTimeout(timer);reject(Error('VERIFICATION_UNAVAILABLE'));};document.head.append(script);
    }).catch(e=>{scriptPromise=null;throw e;});return scriptPromise;
  }
  async function verify(message=w.verify){
    clearVerification();retry.hidden=true;status.textContent=message;
    if(!transport?.sendFeedback){status.textContent=w.local;return;}
    const own=generation;
    try{
      const api=await loadVerification();if(own!==generation||!dialog.open||succeeded)return;
      widget=api.render(verification,{sitekey:transport.turnstileSitekey,action:'feedback_send',theme:'auto',size:matchMedia('(max-width: 370px)').matches?'compact':'flexible','response-field':false,
        callback(value){if(own!==generation||sending||!dialog.open)return;token=value;sync();if(status.textContent===w.verify)status.textContent='';},
        'error-callback'(){if(own===generation){queueMicrotask(()=>{if(own!==generation)return;clearVerification();status.textContent=w.verifyLoad;retry.hidden=false;});}return true;},
        'expired-callback'(){if(own===generation)verify();},'timeout-callback'(){if(own===generation)verify();}});
    }catch{if(own===generation){status.textContent=w.verifyLoad;retry.hidden=false;}}
  }
  function closeDialog(){if(sending)return;clearVerification();dialog.close();if(wasInert)dialog.setAttribute('inert','');document.documentElement.classList.remove('kt-feedback-open');document.body.classList.remove('kt-feedback-open');opener?.focus({preventScroll:true});}
  function open(from=entry){if(dialog.open)return;opener=from;succeeded=false;form.hidden=false;contact.error.textContent='';interest.error.textContent='';contact.input.removeAttribute('aria-invalid');interest.input.removeAttribute('aria-invalid');wasInert=dialog.hasAttribute('inert');dialog.removeAttribute('inert');dialog.showModal();document.documentElement.classList.add('kt-feedback-open');document.body.classList.add('kt-feedback-open');contact.input.focus({preventScroll:true});verify();}
  function validate(){
    const bad=points(contact.input.value.trim())>200||!contact.input.value.trim()||contact.input.validity.typeMismatch;
    contact.error.textContent=bad?w.contactError:'';contact.input.setAttribute('aria-invalid',String(bad));
    const tooLong=points(interest.input.value.trim())>500;interest.error.textContent=tooLong?w.interestError:'';interest.input.setAttribute('aria-invalid',String(tooLong));
    if(bad||tooLong){(bad?contact.input:interest.input).focus();return false;}return true;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||succeeded||!validate()||!token||!transport?.sendFeedback)return;
    const message=['KT Ask the Guide — Closed Beta application',`Reply language: ${en?'English':'中文'}`,interest.input.value.trim()].filter(Boolean).join('\n');
    if(points(message)>2000||points(location.hash)>256)return;
    const usedToken=token;token=null;sending=true;status.textContent=w.sending;sync();
    const payload={category:'other',message,contact:contact.input.value.trim(),guideVersion:context.guideVersion,locale:context.locale,pagePath:location.pathname,pageHash:location.hash,viewportClass:innerWidth<768?'mobile':'desktop',relatedCommentId:'',turnstileToken:usedToken,honeypot:honeypot.value};
    try{
      const response=await transport.sendFeedback(payload);if(response?.httpStatus!==202)throw Error('UNCONFIRMED_DELIVERY');
      succeeded=true;clearVerification();contact.input.value='';interest.input.value='';form.hidden=true;status.textContent=w.success;
    }catch(error){
      const known={RATE_LIMITED:w.rate,VERIFICATION_FAILED:w.failedVerify,SERVICE_UNAVAILABLE:w.unavailable};
      clearVerification();status.textContent=known[error?.code]||w.uncertain;retry.hidden=false;
    }finally{sending=false;sync();if(succeeded)close.focus({preventScroll:true});}
  });
  close.addEventListener('click',closeDialog);cancel.addEventListener('click',closeDialog);dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button,input,textarea,summary,a[href],[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length&&!el.closest('[hidden],[inert]'));
    if(!focusable.length)return;
    event.preventDefault();const index=focusable.indexOf(document.activeElement);
    const next=index<0?(event.shiftKey?focusable.length-1:0):(index+(event.shiftKey?-1:1)+focusable.length)%focusable.length;
    focusable[next].focus();
  });
  retry.addEventListener('click',()=>verify(status.textContent));
  for(const f of [contact,interest])f.input.addEventListener('input',()=>{f.error.textContent='';f.input.removeAttribute('aria-invalid');});
  entry.addEventListener('click',e=>{e.preventDefault();open(entry);});
  window.KTBetaApplication=Object.freeze({open});
  document.dispatchEvent(new Event('kt:beta-application-ready'));
  if(location.hash==='#ask-guide-beta')open(entry);
})();
