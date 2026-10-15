// Public URL shortener API described in the provided rul.kr documentation.
const ENDPOINT='https://rul.kr/create';
// Four-character minimum in API docs only applies to user-specified custom_code.
const CODE_PATTERN=/^[A-Za-z0-9_-]{1,128}$/;
export class ShortenerError extends Error{
 constructor(message,reason,status=502,diagnostics){super(message);this.name='ShortenerError';this.reason=reason;this.status=status;this.diagnostics=diagnostics;}
}

function safeShape(data){
 const object=data!==null&&typeof data==='object'&&!Array.isArray(data);
 return {responseType:Array.isArray(data)?'array':data===null?'null':typeof data,
  fields:object?Object.keys(data).slice(0,12).map(x=>x.slice(0,32)):[]};
}
function trustedShortURL(value){
 if(typeof value!=='string')return null;
 let url;try{url=new URL(value.trim());}catch{return null;}
 if(url.protocol!=='https:'||url.hostname!=='rul.kr'||url.port||url.username||
    url.password||url.search||url.hash||url.pathname.split('/').length!==2)return null;
 const code=url.pathname.slice(1);
 return CODE_PATTERN.test(code)?{code,url:'https://rul.kr/'+code}:null;
}
export function validateShortLinkResponse(raw){
 let data=raw;
 if(typeof data==='string'){
  try{data=JSON.parse(data);}catch{data={short_url:data};}
 }
 const objects=[data,data?.data,data?.result].filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
 if(objects.some(x=>x.success===false||x.success==='false'||x.ok===false||x.status==='error'))
  throw new ShortenerError('단축 서비스에서 주소 생성을 거부했습니다.','upstream_rejected',502,safeShape(data));
 for(const obj of objects){
  const rawCode=obj.short_code??obj.shortCode??obj.code;
  const code=typeof rawCode==='string'?rawCode.trim():undefined;
  let hadLink=false;
  for(const value of [obj.short_url,obj.shortUrl,obj.shortened_url,obj.shortenedUrl,
                       obj.short_link,obj.shortLink,obj.link,obj.url]){
   if(typeof value!=='string'||!value.trim())continue;
   hadLink=true;
   const verified=trustedShortURL(value);
   if(verified&&(code===undefined||code===verified.code))return verified.url;
  }
  if(hadLink)continue;
  if(code&&CODE_PATTERN.test(code)&&(obj.success===true||obj.success==='true'||obj.ok===true))
   return 'https://rul.kr/'+code;
 }
 throw new ShortenerError('단축 서비스의 응답 형식이 예상과 다릅니다.','invalid_response',502,safeShape(data));
}

const REDIRECT_CODES=new Set([301,302,307,308]);
const MAX_REDIRECTS=2;
function validatedEndpointRedirect(value,base){
 let target;
 try{target=new URL(value,base);}catch{}
 if(!target||target.protocol!=='https:'||target.hostname!=='rul.kr'||target.port||target.username||target.password||target.search||target.hash||!['/create','/create/'].includes(target.pathname)){
  throw new ShortenerError('단축 서비스가 허용되지 않은 경로로 이동을 요청했습니다.','invalid_redirect',502);
 }
 return target.href;
}

export async function shortenOriginalURL(original,fetchImpl=fetch,timeoutMs=15000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 const body=JSON.stringify({url:original,type:'public'});
 let endpoint=ENDPOINT;
 try{
  for(let redirects=0;redirects<=MAX_REDIRECTS;redirects++){
   // Cloudflare workerd rejects redirect:'error' even when the upstream does not redirect.
   const response=await fetchImpl(endpoint,{
    method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
    body,signal:controller.signal,redirect:'manual'
   });
   if(REDIRECT_CODES.has(response.status)){
    if(redirects===MAX_REDIRECTS)throw new ShortenerError('단축 서비스의 경로 이동이 반복됩니다.','too_many_redirects',502);
    endpoint=validatedEndpointRedirect(response.headers?.get('location'),endpoint);
    continue;
   }
   if(response.status>=300&&response.status<400)throw new ShortenerError('단축 서비스의 응답 경로를 확인할 수 없습니다.','upstream_redirect',502);
   if(response.status===429)throw new ShortenerError('짧은 링크 요청이 많습니다. 잠시 후 다시 시도해 주세요.','rate_limited',503);
   if(!response.ok)throw new ShortenerError('짧은 링크를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.','upstream_error',502,{httpStatus:response.status});
   let data;try{data=await response.json();}catch{throw new ShortenerError('단축 서비스 응답이 올바른 JSON이 아닙니다.','invalid_json',502,{httpStatus:response.status,contentType:response.headers?.get('content-type')?.slice(0,80)||'unknown'});}
   return validateShortLinkResponse(data);
  }
 }catch(e){
  if(e instanceof ShortenerError)throw e;
  if(controller.signal.aborted||e?.name==='AbortError')throw new ShortenerError('짧은 링크 연결이 지연되고 있습니다. 다시 시도해 주세요.','timeout',504);
  throw new ShortenerError('짧은 링크 서비스에 연결할 수 없습니다.','network_error',502);
 }finally{clearTimeout(timer);}
}
