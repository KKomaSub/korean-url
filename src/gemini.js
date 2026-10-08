import {readMotifs} from './meaning.js';

export function apiKeys(value){return [...new Set(String(value||'').split(',').map(s=>s.trim()).filter(Boolean))];}
export function geminiPrompt(slug){
 const {items}=readMotifs(slug);
 const samples=items.length?items.slice(0,5).map(x=>`${x.theme} → ${x.subject}, ${x.bridge}, ${x.object} (${x.action})`).join('; '):'특별한 문법 없이 이어진 한국어 낱말';
 // Never send the user's original target URL: it could contain secrets or tokens.
 return `당신은 우리말 짧은 문장에 서정적인 뜻을 붙이는 한국어 필자입니다.\n다음 문장은 인터넷 주소를 무손실로 부호화한 것으로, 낱말들이 의도적으로 역사적 사실을 암호화한 것은 아닙니다.\n실제 문장에 적힌 단어들만 바탕으로 구체적이고 자연스럽게 2~3문장(100~230자)으로 한국어 문학적 해석을 써주세요. 역사적 사실이라고 단정하지 말고 비유·상징임을 드러내세요. '암호/알고리즘' 같은 전문용어는 불필요하게 쓰지 마세요. 문장마다 같은 뻔한 설명을 반복하지 마세요.\n문장: ${slug.slice(0,1700)}\n서로 관련된 주제의 실마리: ${samples}\n응답 JSON: {"meaning":"여기에 해석"}`;
}
export function parseGeminiResponse(response){
 const candidate=response?.candidates?.[0];
 const full=(candidate?.content?.parts||[]).map(p=>p.text||'').join('').trim();
 if(!full)return null;
 let meaning;
 try{meaning=JSON.parse(full.replace(/^```(?:json)?\s*|\s*```$/g,'')).meaning;}
 catch{meaning=full.replace(/^```(?:json)?\s*|\s*```$/g,'');}
 if(typeof meaning!=='string')return null;
 meaning=meaning.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
 return meaning.length>=35&&meaning.length<=900?meaning:null;
}
export async function askGemini(slug,env,fetchImpl=fetch){
 const keys=apiKeys(env.GEMINI_API_KEYS||env.GEMINI_API_KEY);
 if(!keys.length)return {text:null,reason:'no_keys'};
 const model=String(env.GEMINI_MODEL||'gemini-2.5-flash-lite');
 if(!/^gemini-[a-z0-9.-]{1,65}$/i.test(model))return {text:null,reason:'invalid_model'};
 const randomStart=hashSlug(slug)%keys.length;
 const body=JSON.stringify({contents:[{role:'user',parts:[{text:geminiPrompt(slug)}]}],generationConfig:{temperature:0.72,maxOutputTokens:500,responseMimeType:'application/json'}});
 for(let offset=0;offset<keys.length;offset++){
  const key=keys[(randomStart+offset)%keys.length];
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5300);
   let r;try{r=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body,signal:controller.signal});}
   finally{clearTimeout(timer);}
   if(!r.ok)continue;
   const data=await r.json(),text=parseGeminiResponse(data);
   if(text)return {text,model,reason:null};
  }catch{} // Retry on another key; do not expose keys or upstream errors to clients.
 }
 return {text:null,reason:'all_keys_failed'};
}
function hashSlug(s){let x=0;for(const c of s)x=(Math.imul(x,33)+c.charCodeAt(0))>>>0;return x;}
