import {decodeURLv4} from '../../src/codec-v4.js';
import {decodeURLv3} from '../../src/codec-v3.js';
import {decodeURL as decodeURLv2} from '../../src/codec-v2.js';
import {fallbackMeaning} from '../../src/meaning.js';
import {askGemini,apiKeys,isAiEligible} from '../../src/gemini.js';
import {dateKey,sha256,visitorHash,getCache,putCache,getQuota,reserveQuota,refundQuota,markOutage,lockMeaning,unlockMeaning} from '../../src/meaning-storage.js';

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
 const slug=data?.path,mode=data?.mode==='ai'?'ai':'local';
 if(typeof slug!=='string'||slug.length>14000||slug.length<2||!/^[가-힣]+$/.test(slug))return json({ok:false,error:'INVALID_PATH'},400);
 let originalURL;try{originalURL=await verifiedPath(slug);}catch{return json({ok:false,error:'INVALID_PATH'},400);}
 const tooLong=!isAiEligible(slug,originalURL,env);
 const fallback=fallbackMeaning(slug);
 const local=(reason,quota=null)=>json({ok:true,meaning:fallback,source:'local',cached:false,reason,quota,aiAvailable:!tooLong&&!!(quota?.remaining>0&&apiKeys(env?.GEMINI_API_KEYS||env?.GEMINI_API_KEY).length)});
 const db=env?.MEANING_DB;
 if(!db)return local(tooLong?'ai_url_too_long':'no_database');
 const device=await visitorHash(data?.fingerprint,env);
 if(!device)return local(tooLong?'ai_url_too_long':'device_unavailable');
 const day=dateKey(Date.now(),env.QUOTA_TIMEZONE||'Asia/Seoul');
 let quota;
 try{quota=await getQuota(db,day,device,env);}catch{return local('database_schema_error');}
 if(mode==='local')return local(tooLong?'ai_url_too_long':'rules',quota); // The browser never spends a Gemini call on form submission.
 if(tooLong)return local('ai_url_too_long',quota);
 if(quota.remaining===0)return local('daily_limit',quota);
 if(!apiKeys(env.GEMINI_API_KEYS||env.GEMINI_API_KEY).length)return local('keys_not_configured',quota);
 try{
  const id=await sha256('meaning:v2:'+slug),cached=await getCache(db,id);
  if(cached)return json({ok:true,meaning:cached.interpretation,source:'gemini',cached:true,model:cached.model,quota,aiAvailable:true});
  if(!await lockMeaning(db,id)){
   for(let i=0;i<9;i++){
    await wait(500);
    const ready=await getCache(db,id);
    if(ready)return json({ok:true,meaning:ready.interpretation,source:'gemini',cached:true,model:ready.model,quota,aiAvailable:true});
   }
   return local('being_generated',quota);
  }
  let reserved=false;
  try{
   const ready=await getCache(db,id);
   if(ready)return json({ok:true,meaning:ready.interpretation,source:'gemini',cached:true,model:ready.model,quota,aiAvailable:true});
   reserved=await reserveQuota(db,day,device,quota.limit);
   if(!reserved)return local('daily_limit',await getQuota(db,day,device,env));
   const response=await askGemini(slug,env);
   if(response.text){
    await putCache(db,id,response.text,response.model);
    quota=await getQuota(db,day,device,env);
    return json({ok:true,meaning:response.text,source:'gemini',cached:false,model:response.model,quota,aiAvailable:quota.remaining>0});
   }
   await refundQuota(db,day,device);reserved=false;
   await markOutage(db,day,device); // Only affects next day's bonus; never blocks all API keys.
   quota=await getQuota(db,day,device,env);
   return local(response.reason||'all_keys_failed',quota);
  }catch{
   if(reserved){try{await refundQuota(db,day,device);}catch{}}
   return local('temporary_error',quota);
  }finally{try{await unlockMeaning(db,id);}catch{}}
 }catch{return local('database_error',quota);}
}