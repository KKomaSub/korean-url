import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeURLv3,decodeURLv3} from '../src/codec-v3.js';
import {encodeURL as encodeV2,decodeURL as decodeV2} from '../src/codec-v2.js';
import {themesV3} from '../src/words-v3.js';
const urls=[
 'https://example.com/',
 'https://github.com/KKomaSub/korean-url.git',
 'https://한글날.한국/우리말/아름다운?검색어=세종대왕#ㄱㄴㄷ',
 'http://example.org/a?q=hello%20world&lang=ko',
 'https://www.google.com/search?q=entryjs+javascript&newwindow=1&source=hp',
 'https://example.com/path?token='+encodeURIComponent('한글날'.repeat(140)),
 'https://example.com/path?symbols=%F0%9F%8E%89',
 'https://example.net/aBcd-1234XYZ?x=Z%20Y&y=aa',
 'https://test.example.com/very-long-english-path/no-special-pattern?long=value',
 'http://localhost:8788/index.html',
 'https://example.com/?'+Array.from({length:40},(_,i)=>'p'+i+'=abc123').join('&')
];
for(const original of urls){
 test('v3 roundtrip '+original.slice(0,48),async()=>{
  const slug=await encodeURLv3(original);
  assert.match(slug,/^[가-힣]+$/);
  assert.equal(await decodeURLv3(slug),new URL(original).href);
  const old=await encodeV2(original);
  console.log('URL chars',original.length,'v2',old.length,'v3',slug.length,'saving',Math.round((1-slug.length/old.length)*100)+'%');
 });
}
test('all subject themes are distinct and prefix-free',()=>{
 assert.equal(themesV3.length,256);
 for(const a of themesV3)for(const b of themesV3)if(a!==b)assert.ok(!b.startsWith(a),a+' '+b);
});
test('bare Hangul domain',async()=>{
 const slug=await encodeURLv3('한글날.한국/우리말');
 assert.equal(await decodeURLv3(slug),new URL('https://한글날.한국/우리말').href);
});
test('reject unsafe URL',async()=>{
 await assert.rejects(encodeURLv3('javascript:alert(1)'));
 await assert.rejects(encodeURLv3('https://user:password@example.com/'));
});
test('reject changed phrase',async()=>{
 const slug=await encodeURLv3('https://example.com');
 await assert.rejects(decodeURLv3(slug+'나'));
});
test('v2 compatibility unaffected',async()=>{
 const slug=await encodeV2('https://example.com');
 assert.equal(await decodeV2(slug),'https://example.com/');
});
