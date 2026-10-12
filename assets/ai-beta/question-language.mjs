// Question text is the sole language input. Page locale is never consulted.
export function questionLanguage(question) {
  const text=String(question??'').normalize('NFKC');
  const en=/\b(?:answer|reply|respond)\s+(?:only\s+)?in\s+english\b|(?:用|以|使用)\s*(?:英语|英文)\s*(?:回答|回复)/i.test(text);
  const zh=/\b(?:answer|reply|respond)\s+(?:only\s+)?in\s+(?:chinese|mandarin)\b|(?:用|以|使用)\s*中文\s*(?:回答|回复)/i.test(text);
  if(en!==zh)return en?'en':'zh';
  if(en&&zh)return null;
  // Quoted terms and the established character aliases do not form a clause.
  const prose=text.replace(/`[^`]*`|“[^”]*”|"[^"]*"/g,' ').replace(/蛙蛙|那个大红蜥蜴/g,' ');
  const han=(prose.match(/\p{Script=Han}/gu)??[]).length;
  const englishClause=/\b(?:what|which|how|why|when|where|can|could|should|would|does|do|is|are|before|after|prioritize|please|explain|tell|missed|recover)\b/i.test(prose);
  if(han>=2&&!englishClause)return 'zh';
  if(!han&&englishClause)return 'en';
  return null; // Mixed clauses or terms alone require an explicit language.
}
export const languageClarification='请用中文或英文完整提问；混合语言时请明确写“用中文回答”或“answer in English”。 / Please ask a full question in Chinese or English; for mixed languages, specify “用中文回答” or “answer in English”.';
