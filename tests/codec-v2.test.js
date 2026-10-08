import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeURL,decodeURL} from '../src/codec-v2.js';
import {encodeURL as encodeLegacy,decodePath} from '../src/codec.js';
const urls=[
 'https://example.com/',
 'https://한글날.한국/우리말/아름다운?검색어=세종대왕#ㄱㄴㄷ',
 'http://example.org/a?q=hello%20world&lang=ko',
 'https://www.google.com/search?q=entryjs+javascript&newwindow=1&source=hp',
 'https://example.com/path?token='+encodeURIComponent('한글날'.repeat(140)),
 'https://example.com/path?symbols=%F0%9F%8E%89',
];
for(const original of urls){
 test('v2 roundtrip '+original.slice(0,42),async()=>{
  const slug=await encodeURL(original);
  assert.match(slug,/^[가-힣]+$/);
  assert.equal(await decodeURL(slug),new URL(original).href);
  const old=await encodeLegacy(original);
  assert.ok(slug.length<old.length*0.93,`new ${slug.length} old ${old.length}`);
 });
}
test('bare Hangul domain accepted',async()=>{let slug=await encodeURL('한글날.한국/우리말');assert.equal(await decodeURL(slug),new URL('https://한글날.한국/우리말').href);});
test('invalid scheme blocked',async()=>{await assert.rejects(encodeURL('javascript:alert(1)'));await assert.rejects(encodeURL('https://user:pass@site.com/'));});
test('changed URL rejected',async()=>{const slug=await encodeURL('https://example.com/');await assert.rejects(decodeURL(slug.replace('하늘','바다')+'가'));});
test('legacy redirect is preserved',async()=>{const old=await encodeLegacy('https://example.com/');assert.equal(await decodePath(old.slice(3)),'https://example.com/');});