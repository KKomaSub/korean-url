import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeURLv4,decodeURLv4} from '../src/codec-v4.js';
import {encodeURLv3,decodeURLv3} from '../src/codec-v3.js';
import {encodeURL as encodeV2,decodeURL as decodeV2} from '../src/codec-v2.js';
import {onRequestPost} from '../functions/api.js';
import {onRequestGet} from '../functions/[slug].js';

const examples=[
 'https://example.com/',
 'https://github.com/KKomaSub/korean-url.git',
 'https://www.youtube.com/watch?v=12345',
 'https://www.google.com/search?q=entryjs+javascript&newwindow=1&source=hp',
 'https://한글날.한국/우리말/아름다운?검색어=세종대왕#ㄱㄴㄷ',
 'http://example.org/a?q=hello%20world&lang=ko',
 'https://some-unfamiliar-domain.xyz/path/to/file.txt?ab=123&hello=world',
 'https://example.com/path?token='+encodeURIComponent('한글날'.repeat(120)),
 'https://example.com/?'+Array.from({length:40},(_,i)=>`p${i}=abc123`).join('&'),
 'https://example.net/aBcd-1234XYZ?x=Z%20Y&y=aa',
 'http://localhost:8788/index.html',
 'https://x.com/',
 'https://한글날.한국/',
 'https://한글날.한국/우리말',
 'https://example.com/long?note=%F0%9F%87%B0%F0%9F%87%B7',
];
for(const original of examples)test('v4 reversible: '+original.slice(0,60),async()=>{
 const slug=await encodeURLv4(original);
 assert.match(slug,/^[가-힣]+$/);
 assert.equal(await decodeURLv4(slug),new URL(original).href);
});

test('v4 same URL is deterministic',async()=>{
 const u='https://example.com/alpha?x=beta';
 assert.equal(await encodeURLv4(u),await encodeURLv4(u));
});
test('v4 rejects unauthorized schemes and credentials',async()=>{
 await assert.rejects(encodeURLv4('javascript:alert(1)'));
 await assert.rejects(encodeURLv4('https://user:pass@example.com'));
});
test('v4 rejects changed/extra words',async()=>{
 const id=await encodeURLv4('https://example.com/');
 await assert.rejects(decodeURLv4(id+'문화'));
 await assert.rejects(decodeURLv4('테스트'));
});
test('older v2/v3 links remain decodable',async()=>{
 const old='https://github.com/KKomaSub/korean-url.git';
 assert.equal(await decodeV2(await encodeV2(old)),old);
 assert.equal(await decodeURLv3(await encodeURLv3(old)),old);
});
test('backend creates Unicode site domain and redirects',async()=>{
 const request=new Request('https://xn--bj0bv3c9z6c.xn--3e0b707e/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com/'})});
 const r=await onRequestPost({request});assert.equal(r.status,200);
 const data=await r.json();assert.match(data.path,/^[가-힣]+$/);
 assert.ok(data.url.startsWith('https://한글날.한국/'));
 const response=await onRequestGet({params:{slug:data.path},request:new Request(data.url),next:()=>new Response('pass')});
 assert.equal(response.status,302);assert.equal(response.headers.get('Location'),'https://example.com/');
});

test('previously-issued v4 links survive new Huffman URL modes',async()=>{
 const old='교육의내일이금강과협력을기리고문화가사진을잇다';
 assert.equal(await decodeURLv4(old),'https://example.com/');
});
test('compressed ordinary URLs roundtrip across multiple encoding modes',async()=>{
 const urls=[
  'https://github.com/user/project/blob/main/README.md',
  'https://example.com/?t='+encodeURIComponent('우리말과한글날'.repeat(40)),
  'https://some-domain.dev/abc123/hello-world?q=aBcD_123',
  'https://abc.net/a?x=1&y=2&z=3&hello=world',
 ];
 for(const url of urls){const code=await encodeURLv4(url);assert.equal(await decodeURLv4(code),new URL(url).href);}
});