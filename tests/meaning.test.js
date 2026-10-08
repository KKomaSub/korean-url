import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {encodeURLv4} from '../src/codec-v4.js';
import {fallbackMeaning,readMotifs} from '../src/meaning.js';
import {apiKeys,geminiPrompt,parseGeminiResponse,askGemini} from '../src/gemini.js';
import {dateKey,effectiveLimit,dayBefore,reserveQuota,getQuota,markOutage,sha256} from '../src/meaning-storage.js';
import {pickDictionaryMeaning,lookupDictionary} from '../src/dictionary.js';
import {onRequestPost} from '../functions/api/meaning.js';
import {onRequestGet} from '../functions/api/dictionary.js';
const dbSql=readFileSync(new URL('../migrations/0001_meaning.sql',import.meta.url),'utf8');
function createDb(){const db=new DatabaseSync(':memory:');db.exec(dbSql);return {
 prepare(sql){return {bind(...params){return {async first(){return db.prepare(sql).get(...params)||null;},async run(){return db.prepare(sql).run(...params);}};},async first(){return db.prepare(sql).get()||null;},async run(){return db.prepare(sql).run();}}},
 db
};}
function context(path,db,headers={}){
 return {request:new Request('https://example.test/api/meaning',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'1.2.3.4',...headers},body:JSON.stringify({path})}),env:{MEANING_DB:db,GEMINI_API_KEYS:'bad-key,good-key',GEMINI_MODEL:'gemini-2.5-flash-lite',GEMINI_DAILY_PER_IP:'1',IP_HASH_SALT:'a-long-secret-salt-that-is-not-shared'}};
}
test('word graph explanation uses clause-specific vocabulary and varies by URL',async()=>{
 const a=await encodeURLv4('https://example.com/'),b=await encodeURLv4('https://github.com/KKomaSub/korean-url');
 assert.notEqual(fallbackMeaning(a),fallbackMeaning(b));assert.ok(fallbackMeaning(a).length>100);
 const words=readMotifs(a).items[0];assert.ok(words);assert.ok(fallbackMeaning(a).includes(words.theme));
});
test('API keys are comma-separated and de-duplicated',()=>assert.deepEqual(apiKeys(' a, b , a ,, c '),['a','b','c']));
test('model prompt must not contain original URL',async()=>{const url='https://private.example/x?secret=DO_NOT_EXPOSE';const slug=await encodeURLv4(url);const prompt=geminiPrompt(slug);assert.ok(prompt.includes(slug));assert.ok(!prompt.includes(url));assert.ok(!prompt.includes('DO_NOT_EXPOSE'));});
test('Gemini JSON response parses safely',()=>assert.match(parseGeminiResponse({candidates:[{content:{parts:[{text:JSON.stringify({meaning:'우리가 이어 온 기록을 다시 생각하며 문장에 담긴 여러 이미지들을 차분히 떠올리게 하는 아름다운 표현입니다.'})}]}}]}),/기록/));
test('Korean dictionary schema handles meanList',()=>assert.match(pickDictionaryMeaning({searchResult:{searchResultList:[{items:[{meanList:[{mean:'우리말을 적는 문자.'}]}]}]}}),/우리말/));
test('English dictionary schema handles meansCollector',()=>assert.match(pickDictionaryMeaning({searchResultMap:{searchResultListMap:{WORD:{items:[{meansCollector:[{means:[{value:'연구와 배움.'}]}]}]}}}}),/연구/));
test('dictionary fallback does not return invented meaning',async()=>assert.deepEqual(await lookupDictionary('한글',{},async()=>({ok:false})),{meaning:'모두에게 열린 문자와 소통',source:'context'}));
test('Korean date boundary and previous day',()=>{assert.equal(dateKey(Date.parse('2026-10-08T15:40:00Z')),'2026-10-09');assert.equal(dayBefore('2026-10-09'),'2026-10-08');});
test('next-day outage bonus is floor(used / 2) and granted only once',()=>{assert.equal(effectiveLimit(6,{used:5,outage:1}),8);assert.equal(effectiveLimit(6,{used:5,outage:0}),6);assert.equal(effectiveLimit(6,{used:1,outage:1}),6);});
test('D1 atomic quota rejects extra reservation',async()=>{const x=createDb();assert.equal(await reserveQuota(x,'2026-10-09','ip:1',1),true);assert.equal(await reserveQuota(x,'2026-10-09','ip:1',1),false);assert.equal((await getQuota(x,'2026-10-09','ip:1',{GEMINI_DAILY_PER_IP:'1'})).remaining,0);});
test('D1 outage allows next-day bonus after successful calls',async()=>{const x=createDb();await reserveQuota(x,'2026-10-08','ip:1',10);await reserveQuota(x,'2026-10-08','ip:1',10);await markOutage(x,'2026-10-08','ip:1');const q=await getQuota(x,'2026-10-09','ip:1',{GEMINI_DAILY_PER_IP:'3'});assert.equal(q.limit,4);assert.equal(q.bonus,1);});
test('one key 429 fails over to another key',async()=>{let attempted=0;const fakeFetch=async()=>{attempted++;return attempted===1?{ok:false,status:429}:{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({meaning:'이 문장은 오래된 기록과 새로운 미래를 하나의 길로 이어 보는 상징적인 이야기로, 오늘 우리가 만든 가치를 서로 나누려는 마음을 보여 줍니다.'})}]}}]})};};const result=await askGemini('한글의기록이문화과미래를잇다',{GEMINI_API_KEYS:'one,two'},fakeFetch);assert.equal(attempted,2);assert.ok(result.text);});
test('cache avoids second Gemini request even when IP quota depleted',async t=>{
 const x=createDb(),slug=await encodeURLv4('https://example.com/');let requests=0;
 t.mock.method(globalThis,'fetch',async()=>{requests++;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({meaning:'지식을 통해 새로운 기회를 만들고, 사람들의 경험이 만나 서로를 북돋우는 장면을 그린 문장입니다. 기록과 변화의 흐름을 함께 보여 줍니다.'})}]}}]})};});
 const c=context(slug,x);const first=await (await onRequestPost(c)).json();assert.equal(first.source,'gemini');assert.equal(first.cached,false);
 const second=await (await onRequestPost(context(slug,x))).json();assert.equal(second.cached,true);assert.equal(first.meaning,second.meaning);assert.equal(requests,1);
 const another=await encodeURLv4('https://example.org/');const third=await (await onRequestPost(context(another,x))).json();assert.equal(third.source,'local');assert.equal(third.reason,'daily_limit');assert.equal(requests,1);
});
test('missing D1 yields safe local explanation with no Gemini request',async()=>{const slug=await encodeURLv4('https://example.com/');const c=context(slug,null);const r=await (await onRequestPost(c)).json();assert.equal(r.source,'local');assert.equal(r.reason,'no_database');});
test('dictionary endpoint rejects bad search query',async()=>{const r=await onRequestGet({request:new Request('https://localhost/api/dictionary?q=%3Cscript%3E'),env:{}});assert.equal(r.status,400);});
test('hashing is stable without retaining raw URL',async()=>{assert.equal(await sha256('foo'),await sha256('foo'));assert.notEqual(await sha256('foo'),await sha256('bar'));});
