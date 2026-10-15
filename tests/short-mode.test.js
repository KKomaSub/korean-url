import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {onRequestPost} from '../functions/api.js';
import {onRequestGet} from '../functions/[slug].js';
import {decodeURLv4,encodeURLv4} from '../src/codec-v4.js';
import {validateShortLinkResponse,ShortenerError} from '../src/shortener.js';
const ok={ok:true,status:201,json:async()=>({success:true,short_code:'aBcDeF',short_url:'https://rul.kr/aBcDeF',type:'public'})};
function request(url,mode){return new Request('https://xn--bj0b5d.xn--3e0b707e/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(mode===undefined?{url}:{url,mode})});}
test('normal mode does not call external API',async t=>{let count=0;t.mock.method(globalThis,'fetch',async()=>{count++;throw Error('unexpected');});const r=await onRequestPost({request:request('https://한글날.한국/우리말','normal')});assert.equal(r.status,200);const d=await r.json();assert.equal(await decodeURLv4(d.path),new URL('https://한글날.한국/우리말').href);assert.equal(count,0);});
test('short mode is the default and sends documented public JSON request',async t=>{const calls=[];t.mock.method(globalThis,'fetch',async(url,opt)=>{calls.push([url,opt]);return ok;});const r=await onRequestPost({request:request('한글날.한국/우리말')});assert.equal(r.status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'https://rul.kr/create');assert.deepEqual(JSON.parse(calls[0][1].body),{url:new URL('https://한글날.한국/우리말').href,type:'public'});const d=await r.json();assert.equal(await decodeURLv4(d.path),'https://rul.kr/aBcDeF');const redirect=await onRequestGet({params:{slug:d.path},request:new Request(d.url),next:()=>new Response('static')});assert.equal(redirect.headers.get('location'),'https://rul.kr/aBcDeF');});
test('an API failure does not silently create a normal link',async t=>{t.mock.method(globalThis,'fetch',async()=>({ok:false,status:429}));const r=await onRequestPost({request:request('https://example.com')});assert.equal(r.status,503);assert.equal((await r.json()).code,'rate_limited');});
test('short response validates its host and code',()=>{for(const u of ['https://evil.example/abcD','http://rul.kr/abcd','https://rul.kr/abc','https://rul.kr/abcd?x=1','https://rul.kr/foo/bar'])assert.throws(()=>validateShortLinkResponse({success:true,short_url:u}),ShortenerError);assert.equal(validateShortLinkResponse({success:true,short_url:'https://rul.kr/abCD_1',short_code:'abCD_1'}),'https://rul.kr/abCD_1');});
test('old v4 links continue redirecting',async()=>{const slug=await encodeURLv4('https://example.com/');const r=await onRequestGet({params:{slug},request:new Request('https://site.example/'+slug),next:()=>new Response('static')});assert.equal(r.headers.get('location'),'https://example.com/');});
test('UI stores and restores current link mode',async()=>{const html=await readFile(new URL('../index.html',import.meta.url),'utf8');for(const s of ['geulgil_link_mode_v1',"let linkMode='short'",'localStorage.getItem(LINK_MODE_STORAGE_KEY)','localStorage.setItem(LINK_MODE_STORAGE_KEY,linkMode)','mode:selectedMode','role="radiogroup"','data-link-mode="normal"'])assert.ok(html.includes(s),s);assert.ok(!html.includes('rul.kr/create'));});

test('Cloudflare Worker compatible fetch redirects must use manual',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  if(opts.redirect==='error')throw TypeError('Invalid redirect value');
  calls.push([url,opts]);
  return ok;
 });
 const response=await onRequestPost({request:request('https://example.com/a','short')});
 assert.equal(response.status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0][1].redirect,'manual');
 assert.equal(await decodeURLv4((await response.json()).path),'https://rul.kr/aBcDeF');
});
test('same-origin 308 redirects are explicitly followed with POST body',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  calls.push([url,opts]);
  if(calls.length===1)return {status:308,headers:new Headers({location:'/create/'})};
  return ok;
 });
 const response=await onRequestPost({request:request('https://example.com/','short')});
 assert.equal(response.status,200);
 assert.deepEqual(calls.map(c=>c[0]),['https://rul.kr/create','https://rul.kr/create/']);
 assert.equal(calls[0][1].body,calls[1][1].body);
});
test('untrusted redirect destinations cannot receive original URL',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{
  calls++;return {status:307,headers:new Headers({location:'https://attacker.example/create'})};
 });
 const response=await onRequestPost({request:request('https://example.com/private?token=secret','short')});
 assert.equal(response.status,502);
 assert.equal((await response.json()).code,'invalid_redirect');
 assert.equal(calls,1);
});
test('redirect loops are stopped after two hops',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return {status:308,headers:new Headers({location:'/create/'})};});
 const response=await onRequestPost({request:request('https://example.com/','short')});
 assert.equal(response.status,502);
 assert.equal((await response.json()).code,'too_many_redirects');
 assert.equal(calls,3);
});
