import {decodeURLv4} from '../../src/codec-v4.js';
import {decodeURLv3} from '../../src/codec-v3.js';
import {decodeURL as decodeURLv2} from '../../src/codec-v2.js';
import {fallbackMeaning} from '../../src/meaning.js';
import {askGemini,apiKeys} from '../../src/gemini.js';
import {dateKey,sha256,visitorHash,getCache,putCache,getQuota,reserveQuota,refundQuota,markOutage,isOutage,reportOutage,clearOutage,lockMeaning,unlockMeaning} from '../../src/meaning-storage.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verifiedPath(slug){
 try{return await decodeURLv4(slug);}catch{}
 try{return await decodeURLv3(slug);}catch{}
 return await decodeURLv2(slug);
}
export async function onRequestPost({request,env}){
 let data;
 try{
  if(Number(request.headers.get('content-length')||0)>32000)return json({ok:false,error:'TOO_LARGE'},413);
  data=await request.json();
 }catch{return json({ok:false,error:'INVALID_JSON'},400);}
 const slug=data?.path;
 if(typeof slug!=='string'||slug.length>14000||slug.length<2||!/^[가-힣]+$/.test(slug))return json({ok:false,error:'INVALID_PATH'},400);
 try{await verifiedPath(slug);}catch{return json({ok:false,error:'INVALID_PATH'},400);}
 const fallback=fallbackMeaning(slug);
 const local=(reason,quota=null)=>json({ok:true,meaning:fallback,source:'local',cached:false,reason,quota});
 const db=env?.MEANING_DB;
 if(!db)return local('no_database');
 try{
  const id=await sha256('meaning:v1:'+slug),cached=await getCache(db,id);
  if(cached)return json({ok:true,meaning:cached.interpretation,source:'gemini',cached:true,model:cached.model});
  const day=dateKey(Date.now(),env.QUOTA_TIMEZONE||'Asia/Seoul');
  const ip=await visitorHash(request,env);
  if(!ip)return local('ip_unavailable');
  let quota=await getQuota(db,day,ip,env);
  if(quota.remaining===0)return local('daily_limit',quota);
  const keys=apiKeys(env.GEMINI_API_KEYS||env.GEMINI_API_KEY);
  if(!keys.length){await markOutage(db,day,ip);return local('keys_not_configured',quota);}
  if(await isOutage(db)){
   await markOutage(db,day,ip);return local('all_keys_cooling_down',quota);
  }
  if(!await lockMeaning(db,id)){
   // Another request is making the same explanation: do not spend another key call.
   for(let i=0;i<9;i++){
    await wait(500);
    const ready=await getCache(db,id);
    if(ready)return json({ok:true,meaning:ready.interpretation,source:'gemini',cached:true,model:ready.model});
   }
   return local('being_generated',quota);
  }
  let reserved=false;
  try{
   // Recheck in case a different request finished between first read and lock.
   const ready=await getCache(db,id);
   if(ready)return json({ok:true,meaning:ready.interpretation,source:'gemini',cached:true,model:ready.model});
   reserved=await reserveQuota(db,day,ip,quota.limit);
   if(!reserved)return local('daily_limit',await getQuota(db,day,ip,env));
   const response=await askGemini(slug,env);
   if(response.text){
    await putCache(db,id,response.text,response.model);
    await clearOutage(db);
    quota=await getQuota(db,day,ip,env);
    return json({ok:true,meaning:response.text,source:'gemini',cached:false,model:response.model,quota});
   }
   await refundQuota(db,day,ip);reserved=false;
   await markOutage(db,day,ip);
   await reportOutage(db); // All configured keys failed: 5-minute cooldown.
   quota=await getQuota(db,day,ip,env);
   return local(response.reason||'all_keys_failed',quota);
  }catch(err){
   if(reserved){try{await refundQuota(db,day,ip);}catch{}}
   return local('temporary_error');
  }finally{try{await unlockMeaning(db,id);}catch{}}
 }catch{return local('database_error');}
}
