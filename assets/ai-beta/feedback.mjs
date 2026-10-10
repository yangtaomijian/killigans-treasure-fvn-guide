export const descriptions=Object.freeze({
 BETA_NOT_APPROVED:'已登录，尚未获准参加封闭测试。请等待站长手动确认；本次未提交问题。',
 BETA_ACCESS_UNAVAILABLE:'暂时无法确认测试资格；本次未提交问题，请稍后查看状态。',
 PROVIDER_DISABLED:'问攻略暂未启用；可以继续阅读攻略或使用站内搜索。',
 PROVIDER_ADMISSION_OFF:'问攻略暂未接收请求；可以继续阅读攻略或使用站内搜索。',
 GLOBAL_EMERGENCY_STOP:'问攻略已暂停；不会自动重发，请使用攻略或站内搜索。',
 BUDGET_CLOSED:'本轮服务额度已用完，暂未接收本题；请使用攻略或站内搜索。',
 AUTH_REQUIRED:'请先登录。',SESSION_CSRF:'登录状态已失效，请重新登录后主动提交。',
 ALLOWANCE_EXHAUSTED:'可用额度不足，请等待恢复。',
 ALLOWANCE_INSUFFICIENT:'可用额度不足，请等待恢复。',
 BUSY:'当前繁忙，暂未接收本题；请稍后主动提交。',
 GLOBAL_BUSY:'当前繁忙，暂未接收本题；请稍后主动提交。',
 PROVIDER_BUSY:'当前繁忙，暂未接收本题；请稍后主动提交。',
 USER_BUSY:'本题仍在处理，请查询状态。',
 OFFTOPIC_COOLDOWN:'请只提交本攻略相关的问题；稍后可再次提问。',
 OWNER_REJECTED:'无法访问这个请求；请确认当前登录账户。',
 CONNECTION_UNKNOWN:'连接已中断，结果待确认。请查询同一题，不会自动重发。',
 COST_UNKNOWN:'处理结果待核对；请查询状态，不会自动重发。',
 ACCOUNTING_UNCERTAIN:'服务正在核对未确定的请求；暂不接收新题。',
 DEADLINE_EXCEEDED:'本题已超时；额度是否退还以返回的结算状态为准。',
 NO_EVIDENCE:'当前攻略材料不足以回答本题；可以补充条件或使用站内搜索。',
 REQUEST_PENDING:'请先确认当前请求的状态。',
 SESSION_CHANGED:'登录身份已变更，本页问答内容已清除。',
 USER_CANCELLED_BEFORE_SEND:'本题已在发送前取消。',
 USER_CANCELLED_AFTER_SEND:'本题已取消；已发送的处理无法撤回。',
});
export function feedbackFor(value={}) {
 if(descriptions[value.code])return descriptions[value.code];
 if(['accepted','processing','waiting','pending'].includes(value.status))
   return '正在处理本题，最多等待约3分钟；可以取消或查询状态，不会自动重发。';
 if(['unknown','UNKNOWN'].includes(value.status))return '结果待确认，请查询同一题，不会自动重发。';
 if(value.status==='failed')return '本题未完成；额度是否退还以返回的结算状态为准，不会自动重发。';
 if(value.status==='cancelled')return value.providerStarted===true
   ? '本题已取消；已发送的处理无法撤回，额度按返回的结算状态处理。'
   : '本题取消状态已返回；额度按返回的结算状态处理。';
 if(value.status==='completed'&&(value.note||value.partial===true))
   return '本题已返回，部分需求缺少材料。请查看回答中的限制和来源。';
 return value.status==='completed'?'本题已返回，请结合攻略来源核对。':'本题暂未接收，不会自动重发。';
}
