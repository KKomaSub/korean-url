// Public URL shortener API described in the provided rul.kr documentation.
const ENDPOINT='https://rul.kr/create';
// Four-character minimum in API docs only applies to user-specified custom_code.
const CODE_PATTERN=/^[A-Za-z0-9_-]{1,128}$/;

export class ShortenerError extends Error{
 constructor(message,reason,status=502,diagnostics){super(message);this.name='ShortenerError';this.reason=reason;this.status=status;this.diagnostics=diagnostics;}
}
function responseObjects(raw){
 let data=raw;
 if(typeof data==='string'){try{data=JSON.parse(data);}catch{data={short_url:data};}}
 return {data,objects:[data,data?.data,data?.result].filter(x=>x&&typeof x==='object'&&!Array.isArray(x))};
}
function shortCode(obj){
 const c=obj.short_code??obj.shortCode??obj.code;
 return typeof c==='string'?c.trim():Number.isSafeInteger(c)&&c>=0?String(c):null;
}
function links(obj){
 return [obj.short_url,obj.shortUrl,obj.shortened_url,obj.shortenedUrl,obj.short_link,obj.shortLink,obj.link,obj.url]
 .filter(s=>typeof s==='string'&&s.trim());
}
function safeShape(raw){
 const {data,objects}=responseObjects(raw),obj=objects[0]||{};
 const code=shortCode(obj),link=links(obj)[0];
 const d={responseType:Array.isArray(data)?'array':data===null?'null':typeof data,
  fields:objects.length?Object.keys(obj).slice(0,12).map(s=>s.slice(0,32)):[],
  successType:typeof obj.success,successReported:obj.success===true||obj.success==='true'||obj.success===1,
  shortCodeType:typeof (obj.short_code??obj.shortCode),codeValid:code!==null&&CODE_PATTERN.test(code),
  shortUrlType:typeof link,publicType:obj.type===undefined||obj.type==='public'};
 if(link){
  let u;try{u=new URL(link.trim());}catch{}
  d.linkFormat=u?'absolute':'relative';
  if(u){
   d.linkIsRulHost=u.hostname==='rul.kr';
   d.linkIsHttps=u.protocol==='https:';
   d.linkHasQuery=!!u.search;d.linkHasFragment=!!u.hash;
   d.linkHasTrailingSlash=u.pathname.endsWith('/');
   d.linkPathSegments=u.pathname.split('/').filter(Boolean).length;
   if(code!==null)d.linkCodeMatches=u.pathname.split('/').filter(Boolean).at(-1)===code;
  }
 }
 return d;
}
function normalizedShortURL(value){
 if(typeof value!=='string')return null;
 const text=value.trim();let url;
 try{
  if(/^https?:\/\//i.test(text))url=new URL(text);
  else if(text.startsWith('//'))url=new URL('https:'+text);
  else if(/^rul\.kr\//i.test(text))url=new URL('https://'+text);
  else if(text.startsWith('/'))url=new URL(text,'https://rul.kr');
  else if(CODE_PATTERN.test(text))url=new URL('/'+text,'https://rul.kr');
  else return null;
 }catch{return null;}
 if(!['https:','http:'].includes(url.protocol)||url.hostname!=='rul.kr'||url.port||
 url.username||url.password||url.search||url.hash)return null;
 const parts=url.pathname.split('/').filter(Boolean);
 if(parts.length!==1||!CODE_PATTERN.test(parts[0]))return null;
 return {code:parts[0],url:'https://rul.kr/'+parts[0]};
}
function failed(obj){return obj.success===false||obj.success==='false'||obj.ok===false||obj.status==='error'||(Object.hasOwn(obj,'error')&&obj.error!==null&&obj.error!==false&&obj.error!=='');}
function publicType(obj){return obj.type===undefined||obj.type==='public';}
export function validateShortLinkResponse(raw){
 const {data,objects}=responseObjects(raw);
 if(objects.some(failed))throw new ShortenerError('단축 서비스가 요청을 거부했습니다.','upstream_rejected',502,safeShape(data));
 if(objects.some(x=>!publicType(x)))throw new ShortenerError('단축 서비스가 공개 링크가 아닌 주소를 반환했습니다.','invalid_type',502,safeShape(data));
 for(const obj of objects){
  const code=shortCode(obj),candidates=links(obj);
  for(const item of candidates){
   const parsed=normalizedShortURL(item);
   if(parsed&&(code===null||code===parsed.code))return parsed.url;
  }
  if(!candidates.length&&code&&CODE_PATTERN.test(code)&&
   (obj.success===true||obj.success==='true'||obj.success===1||obj.ok===true))return 'https://rul.kr/'+code;
 }
 throw new ShortenerError('단축 서비스 응답의 주소와 코드가 일치하지 않습니다.','invalid_response',502,safeShape(data));
}
async function confirmShortCode(data,fetchImpl,signal){
 const {objects}=responseObjects(data);
 if(objects.some(failed)||objects.some(x=>!publicType(x)))return null;
 const match=objects.find(x=>shortCode(x)&&CODE_PATTERN.test(shortCode(x)));
 if(!match)return null;
 const code=shortCode(match);
 for(const obj of objects){
  for(const value of links(obj)){
   if(normalizedShortURL(value))continue;
   let url;try{url=new URL(value);}catch{}
   if(url&&url.hostname!=='rul.kr')return null;
  }
 }
 try{
  const r=await fetchImpl('https://rul.kr/api/stats/'+encodeURIComponent(code),{
    method:'GET',headers:{accept:'application/json'},signal,redirect:'manual'
  });
  if(!r.ok||r.status!==200)return null;
  const stats=await r.json();
  if(stats?.short_code===code&&stats?.type==='public')return 'https://rul.kr/'+code;
 }catch{}
 return null;
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
   try{return validateShortLinkResponse(data);}
   catch(e){
    if(!(e instanceof ShortenerError)||e.reason!=='invalid_response')throw e;
    const checked=await confirmShortCode(data,fetchImpl,controller.signal);
    if(checked)return checked;
    throw e;
   }
  }
 }catch(e){
  if(e instanceof ShortenerError)throw e;
  if(controller.signal.aborted||e?.name==='AbortError')throw new ShortenerError('짧은 링크 연결이 지연되고 있습니다. 다시 시도해 주세요.','timeout',504);
  throw new ShortenerError('짧은 링크 서비스에 연결할 수 없습니다.','network_error',502);
 }finally{clearTimeout(timer);}
}
