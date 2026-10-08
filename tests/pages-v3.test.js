import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api.js';
import {onRequestGet} from '../functions/[slug].js';
import {encodeURL as encodeV2} from '../src/codec-v2.js';
import {encodeURLv3,decodeURLv3} from '../src/codec-v3.js';

const site='https://글길.한국';
async function post(input){
 const request=new Request(site+'/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:input})});
 return onRequestPost({request});
}
async function get(slug){
 return onRequestGet({params:{slug},request:new Request(site+'/'+encodeURIComponent(slug)),next:()=>new Response('static')});
}
test('Pages generates readable Korean-site links and redirects',async()=>{
 const input='https://한글날.한국/우리말/감사합니다?새해=2026';
 const response=await post(input);
 assert.equal(response.status,200);
 const json=await response.json();
 assert.match(json.url,/^https:\/\/글길\.한국\//);
 assert.ok(!json.url.includes('xn--'));
 assert.match(json.path,/^[가-힣]+$/);
 const redirect=await get(json.path);
 assert.equal(redirect.status,302);
 assert.equal(redirect.headers.get('location'),new URL(input).href);
});
test('v2 addresses remain valid',async()=>{
 const original='https://www.google.com/search?q=%ED%95%9C%EA%B8%80';
 const slug=await encodeV2(original);
 const response=await get(slug);
 assert.equal(response.status,302);
 assert.equal(response.headers.get('location'),new URL(original).href);
});
test('invalid slug is not redirected',async()=>assert.equal((await get('한글문장')).status,404));
test('Unicode and percent encoding roundtrip',async()=>{
 for(const url of ['https://한글날.한국/한글날','https://example.com/%ed%95%9c','https://example.com/%41%42%43','https://example.com/%25ED%2595%259C','https://example.com/%F0%9F%8E%89']){
  const slug=await encodeURLv3(url);
  assert.equal(await decodeURLv3(slug),new URL(url).href,url);
 }
});
test('160 diverse routes roundtrip without collisions',async()=>{
 let state=0x81cb9810;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 const abc='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
 for(let k=0;k<160;k++){
  let path='';const length=5+(rand()%145);
  for(let i=0;i<length;i++)path+=abc[rand()%abc.length];
  const url=(k%2?'http':'https')+'://example.com/'+path+'?q='+k+'&hangul='+encodeURIComponent(k%3?'세종대왕':'한글날');
  const slug=await encodeURLv3(url);
  assert.match(slug,/^[가-힣]+$/);
  assert.equal(await decodeURLv3(slug),new URL(url).href);
 }
});
