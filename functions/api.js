import {encodeURLv4,normalizeInputURL} from '../src/codec-v4.js';
import {displayOrigin} from '../src/idn.js';
import {shortenOriginalURL,ShortenerError} from '../src/shortener.js';
export async function onRequestPost({request}){
 let data;
 try{if(Number(request.headers.get('content-length')||0)>12000)return json({error:'입력 주소가 너무 깁니다.'},413);data=await request.json();}
 catch{return json({error:'요청 형식이 잘못되었습니다.'},400);}
 const mode=data?.mode===undefined?'short':data.mode;
 if(mode!=='short'&&mode!=='normal')return json({error:'선택할 수 없는 링크 모드입니다.'},400);
 try{
  const original=normalizeInputURL(data?.url);
  if(new TextEncoder().encode(original).length>4096)throw Error('원본 주소는 4,096바이트 이하로 입력해 주세요.');
  const target=mode==='short'?await shortenOriginalURL(original):original;
  const slug=await encodeURLv4(target);
  const url=displayOrigin(request.url)+'/'+slug;
  if(new URL(url).href.length>14500)throw Error('변환 경로가 서버의 주소 길이 제한을 초과합니다.');
  return json({path:slug,url});
 }catch(e){return json({error:e.message||'변환에 실패했습니다.',code:e instanceof ShortenerError?e.reason:undefined},e instanceof ShortenerError?e.status:400);}
}
function json(o,status=200){return new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','X-Content-Type-Options':'nosniff'}});}
