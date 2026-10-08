import {decodePath} from '../../src/codec.js';
export async function onRequestGet({params}){
 try{
  const path=Array.isArray(params.path)?params.path.join('/'):params.path||'';
  const url=await decodePath(path);
  return new Response(null,{status:302,headers:{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'}});
 }catch(e){return new Response('주소를 찾을 수 없습니다.\n'+(e.message||''),{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}