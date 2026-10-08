import {encodeURL} from '../src/codec-v2.js';
export async function onRequestPost({request}){
 let data;try{data=await request.json();}catch{return json({error:'요청 형식이 잘못되었습니다.'},400);}
 try{const slug=await encodeURL(data.url);return json({path:slug,url:new URL(request.url).origin+'/'+slug});}
 catch(e){return json({error:e.message||'변환에 실패했습니다.'},400);}
}
function json(o,status=200){return new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}