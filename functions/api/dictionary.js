import {lookupDictionary} from '../../src/dictionary.js';
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({request,env}){
 const word=(new URL(request.url).searchParams.get('q')||'').trim().normalize('NFC');
 if(!word||word.length>24||!/^[가-힣a-zA-Z\s]+$/.test(word))return json({ok:false,error:'INVALID_QUERY'},400);
 const entry=await lookupDictionary(word,env);
 if(entry)return json({ok:true,query:word,...entry});
 return json({ok:false,error:'NOT_FOUND',query:word,meaning:null});
}
