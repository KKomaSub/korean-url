import {encodeURLv4} from '../src/codec-v4.js';
import {displayOrigin} from '../src/idn.js';
export async function onRequestPost({request}){
 let data;try{data=await request.json();}catch{return json({error:'요청 형식이 잘못되었습니다.'},400);}
 try{const slug=await encodeURLv4(data.url);const url=displayOrigin(request.url)+'/'+slug;
  if(new URL(url).href.length>14500)throw Error('변환 경로가 서버의 주소 길이 제한을 초과합니다. 저장소 없이 더 짧게 복원할 수 없는 주소입니다.');
  return json({path:slug,url});}
 catch(e){return json({error:e.message||'변환에 실패했습니다.'},400);}
}
function json(o,status=200){return new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}