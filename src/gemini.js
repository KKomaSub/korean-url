import {readMotifs} from './meaning.js';

export function apiKeys(value){return [...new Set(String(value||'').split(',').map(s=>s.trim()).filter(Boolean))];}

// Hard bounds also apply when an administrator sets unusually generous environment values.
function intSetting(value,defaultValue,min,max){
 const n=Number(value);
 return Number.isFinite(n)&&Number.isInteger(n)?Math.min(max,Math.max(min,n)):defaultValue;
}
export function aiLengthLimits(env={}){
 return {
  urlBytes:intSetting(env.GEMINI_MAX_URL_BYTES,512,96,1024),
  pathChars:intSetting(env.GEMINI_MAX_PATH_CHARS,520,80,1200)
 };
}
export function isAiEligible(slug,originalURL,env={}){
 const limit=aiLengthLimits(env);
 return typeof slug==='string'&&typeof originalURL==='string'&&
  slug.length<=limit.pathChars&&new TextEncoder().encode(originalURL).length<=limit.urlBytes;
}
export function geminiPrompt(slug){
 const {items}=readMotifs(slug);
 const samples=items.length?items.slice(0,3).map(x=>`${x.theme}, ${x.subject}, ${x.object} (${x.action})`).join('; '):'문장에 등장하는 주제와 표현';
 return `한글 문장에 담긴 이미지와 상징을 짧게 해석하세요. 실제 역사적 사실이나 숨겨진 암호가 있다고 주장하지 마세요.\n문장에 있는 단어와 동작을 구체적으로 연결하여 서로 다른 URL마다 다른 뜻풀이를 만드세요. 한국어 1~2문장, 합계 60~120자만 쓰고 반복·서론·장황한 설명을 금지합니다. 반드시 짧게 끝내세요.\n문장: ${slug}\n참고 낱말: ${samples}\nJSON만 답하세요: {"meaning":"풀이"}`;
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
 return meaning.length>=20&&meaning.length<=260?meaning:null;
}
const ALLOWED_MODEL=/^gemini-[a-z0-9.-]{1,65}$/i;
export function geminiGenerationConfig(model,env={}){
 const config={
  maxOutputTokens:intSetting(env.GEMINI_MAX_OUTPUT_TOKENS,320,128,512),
  responseMimeType:'application/json'
 };
 // Gemini 3.x supports thinkingLevel; Gemini 2.x does not.
 // Minimal reduces latency, but is not a guarantee of zero thinking tokens.
 if(/^gemini-3(?:\.|-)/.test(model))config.thinkingConfig={thinkingLevel:'minimal'};
 return config;
}

// Increase the old 16s cutoff. Limit both a single key and the entire retry chain,
// so a dead key doesn't keep the page waiting indefinitely.
export async function askGemini(slug,env={},fetchImpl=fetch){
 const keys=apiKeys(env.GEMINI_API_KEYS||env.GEMINI_API_KEY);
 if(!keys.length)return {text:null,reason:'no_keys'};
 const model=String(env.GEMINI_MODEL||'gemini-3.5-flash-lite').trim();
 if(!ALLOWED_MODEL.test(model))return {text:null,reason:'invalid_model'};
 const models=model==='gemini-2.5-flash-lite'?[model,'gemini-3.5-flash-lite']:[model];
 const perAttempt=intSetting(env.GEMINI_TIMEOUT_MS,45000,15000,60000);
 const total=intSetting(env.GEMINI_TOTAL_TIMEOUT_MS,110000,30000,150000);
 const start=Date.now(),failures=[];
 const randomStart=hashSlug(slug)%keys.length;
 for(let offset=0;offset<keys.length;offset++){
  const key=keys[(randomStart+offset)%keys.length];
  for(const currentModel of models){
   const remaining=total-(Date.now()-start);
   if(remaining<2000)break;
   const timeout=Math.min(perAttempt,remaining);
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),timeout);
   const body=JSON.stringify({
    contents:[{role:'user',parts:[{text:geminiPrompt(slug)}]}],
    generationConfig:geminiGenerationConfig(currentModel,env)
   });
   try{
    const r=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`,{
     method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body,signal:controller.signal
    });
    if(!r.ok){
     const failure=r.status===400?'invalid_request':r.status===401||r.status===403?'key_rejected':
      r.status===404?'model_unavailable':r.status===408||r.status===504?'upstream_timeout':
      r.status===429?'rate_limited':r.status>=500?'upstream_unavailable':'upstream_error';
     failures.push(failure);
     if(failure==='model_unavailable'&&currentModel!==models.at(-1))continue;
     break;
    }
    const data=await r.json(),text=parseGeminiResponse(data);
    if(text)return {text,model:currentModel,reason:null};
    failures.push(data?.candidates?.[0]?.finishReason==='MAX_TOKENS'?'output_limit':'invalid_response');
    break;
   }catch(e){
    failures.push(controller.signal.aborted||e?.name==='AbortError'?'timeout':'network_error');
    break;
   }finally{clearTimeout(timer);}
  }
  if(total-(Date.now()-start)<2000)break;
 }
 const reason=failures.every(x=>x==='rate_limited')?'rate_limited':
  failures.every(x=>x==='model_unavailable')?'model_unavailable':
  failures.every(x=>x==='key_rejected')?'key_rejected':
  failures.includes('model_unavailable')?'model_unavailable':
  failures.includes('invalid_request')?'invalid_request':
  failures.includes('output_limit')?'output_limit':
  failures.includes('invalid_response')?'invalid_response':
  failures.includes('timeout')||failures.includes('upstream_timeout')?'timeout':
  failures.every(x=>x==='network_error')?'network_error':
  failures.includes('rate_limited')?'rate_limited':'all_keys_failed';
 return {text:null,reason};
}
function hashSlug(s){let x=0;for(const c of s)x=(Math.imul(x,33)+c.charCodeAt(0))>>>0;return x;}