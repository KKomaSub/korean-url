import {decodeURL} from '../src/codec-v2.js';
export async function onRequestGet({params,request,next}){
 let slug=params.slug;
 try{slug=decodeURIComponent(slug);}catch{return next();}
 // Allow static assets (favicon, etc.) to pass through to Pages.
 if(!/^[가-힣]+$/.test(slug))return next();
 try{
  const original=await decodeURL(slug);
  return new Response(null,{status:302,headers:{Location:original,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'}});
 }catch(e){return new Response('주소를 찾을 수 없습니다.\n'+(e.message||''),{status:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});}
}