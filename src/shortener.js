// Public URL shortener API described in the provided rul.kr documentation.
const ENDPOINT='https://rul.kr/create';
const CODE_PATTERN=/^[A-Za-z0-9_-]{4,128}$/;
export class ShortenerError extends Error{
 constructor(message,reason,status){super(message);this.name='ShortenerError';this.reason=reason;this.status=status;}
}
export function validateShortLinkResponse(data){
 if(!data||data.success!==true||typeof data.short_url!=='string')throw new ShortenerError('단축 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.','invalid_response',502);
 let parsed;try{parsed=new URL(data.short_url);}catch{throw new ShortenerError('단축 서비스가 올바른 주소를 반환하지 않았습니다.','invalid_response',502);}
 const code=parsed.pathname.slice(1);
 if(parsed.protocol!=='https:'||parsed.hostname!=='rul.kr'||parsed.port||parsed.username||parsed.password||parsed.search||parsed.hash||!CODE_PATTERN.test(code)||(typeof data.short_code==='string'&&data.short_code!==code)){
  throw new ShortenerError('단축 서비스가 올바른 주소를 반환하지 않았습니다.','invalid_response',502);
 }
 return parsed.href;
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
   if(!response.ok)throw new ShortenerError('짧은 링크를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.','upstream_error',502);
   let data;try{data=await response.json();}catch{throw new ShortenerError('단축 서비스 응답을 읽을 수 없습니다.','invalid_json',502);}
   return validateShortLinkResponse(data);
  }
 }catch(e){
  if(e instanceof ShortenerError)throw e;
  if(controller.signal.aborted||e?.name==='AbortError')throw new ShortenerError('짧은 링크 연결이 지연되고 있습니다. 다시 시도해 주세요.','timeout',504);
  throw new ShortenerError('짧은 링크 서비스에 연결할 수 없습니다.','network_error',502);
 }finally{clearTimeout(timer);}
}
