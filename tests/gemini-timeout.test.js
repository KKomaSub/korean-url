import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeURLv4} from '../src/codec-v4.js';
import {askGemini,aiLengthLimits,isAiEligible,geminiGenerationConfig,geminiPrompt} from '../src/gemini.js';
import {onRequestPost} from '../functions/api/meaning.js';

const msg='이 문장은 한글의 지혜와 미래의 희망을 연결하며 서로 다른 생각이 모여 새로운 길을 열 수 있음을 보여 줍니다.';
const mockedSuccess={ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({meaning:msg})}]}}]})};
const fp='c'.repeat(64);
const fakeEnv={GEMINI_API_KEYS:'one,two',FINGERPRINT_HASH_SALT:'unpredictable-locally-generated-secret'};

test('short URL is AI eligible; long raw URL is not even if compressed slug is small',async()=>{
 const short='https://example.com/';const slug=await encodeURLv4(short);
 assert.equal(isAiEligible(slug,short),true);
 const long='https://example.com/?token='+'a'.repeat(780);
 const encoded=await encodeURLv4(long);
 assert.ok(encoded.length<520);
 assert.equal(isAiEligible(encoded,long),false);
});

test('long generated Korean sentence is independently rejected',async()=>{
 const bytes=Array.from({length:310},(_,i)=>'abcdefghijklmnopqrstuvwxyz0123456789'[(i*17+i*i)%36]).join('');
 const original='https://example.com/?p='+bytes;
 const path=await encodeURLv4(original);
 // The limit check must be able to enforce the path cap independently of the original URL size.
 assert.equal(isAiEligible('한'.repeat(521),'https://example.com'),false);
 assert.equal(isAiEligible(path,original,{GEMINI_MAX_PATH_CHARS:80}),path.length<=80);
});

test('API refuses Gemini on a long URL and does not call network, including ai opt-in',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('MUST NOT CALL');});
 const original='https://example.com/?token='+'z'.repeat(800);
 const path=await encodeURLv4(original);
 for(const mode of ['local','ai']){
  const request=new Request('https://example.test/api/meaning',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path,mode,fingerprint:fp})});
  const data=await (await onRequestPost({request,env:fakeEnv})).json();
  assert.equal(data.reason,'ai_url_too_long');
  assert.equal(data.aiAvailable,false);
  assert.equal(data.source,'local');
 }
 assert.equal(calls,0);
});

test('prompt is bounded and output uses minimal thinking with a strict token limit',async()=>{
 const slug=await encodeURLv4('https://example.com/');
 const prompt=geminiPrompt(slug);
 assert.ok(prompt.includes(slug));
 assert.match(prompt,/100~170자/);
 assert.ok(prompt.length<1000);
 const cfg=geminiGenerationConfig('gemini-3.5-flash-lite');
 assert.equal(cfg.maxOutputTokens,448);
 assert.deepEqual(cfg.thinkingConfig,{thinkingLevel:'minimal'});
 assert.equal(geminiGenerationConfig('gemini-2.5-flash-lite').thinkingConfig,undefined);
 assert.equal(geminiGenerationConfig('gemini-3.5-flash-lite',{GEMINI_MAX_OUTPUT_TOKENS:999999}).maxOutputTokens,512);
});

test('attempts have increased abort timeout, lower token output and JSON mode',async()=>{
 const calls=[];
 const result=await askGemini('한글의기록이문화과미래를잇다',fakeEnv,async(url,opts)=>{
  const body=JSON.parse(opts.body);
  calls.push({url,body,signal:opts.signal});
  return mockedSuccess;
 });
 assert.equal(result.text,msg);
 assert.equal(calls.length,1);
 assert.equal(calls[0].body.generationConfig.maxOutputTokens,448);
 assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
 assert.equal(calls[0].signal.aborted,false);
});

test('an aborted first key falls back to another, without global cooldown',async()=>{
 let count=0;
 const result=await askGemini('한글의기록이문화과미래를잇다',fakeEnv,async()=>{
  if(++count===1)throw Object.assign(new Error('The operation was aborted'),{name:'AbortError'});
  return mockedSuccess;
 });
 assert.equal(result.text,msg);
 assert.equal(count,2);
});

test('timeouts are distinct from immediate network errors and invalid requests',async()=>{
 let result=await askGemini('한글의기록이문화과미래를잇다',fakeEnv,async()=>{throw Object.assign(new Error('aborted'),{name:'AbortError'});});
 assert.equal(result.reason,'timeout');
 result=await askGemini('한글의기록이문화과미래를잇다',fakeEnv,async()=>{throw TypeError('DNS failed');});
 assert.equal(result.reason,'network_error');
 result=await askGemini('한글의기록이문화과미래를잇다',fakeEnv,async()=>({ok:false,status:400}));
 assert.equal(result.reason,'invalid_request');
});

test('environment limits enforce conservative upper bounds',()=>{
 assert.deepEqual(aiLengthLimits({GEMINI_MAX_URL_BYTES:'999999',GEMINI_MAX_PATH_CHARS:'999999'}),{urlBytes:1024,pathChars:1200});
 assert.deepEqual(aiLengthLimits({GEMINI_MAX_URL_BYTES:'-1',GEMINI_MAX_PATH_CHARS:'0'}),{urlBytes:96,pathChars:80});
});