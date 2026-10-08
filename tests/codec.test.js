import test from 'node:test';import assert from 'node:assert/strict';import {encodeURL,decodePath} from '../src/codec.js';
for(const url of ['https://example.com','https://example.com/a/b?x=안녕&y=%20#가','https://ko.wikipedia.org/wiki/한글날','https://example.com/?data='+ 'z'.repeat(1300)]){
 test('round trip '+url.slice(0,40),async()=>{const path=await encodeURL(url);assert.ok(path.startsWith('글길/'));assert.equal(await decodePath(path.slice(3)),new URL(url).href);});
}
test('refuse broken path',async()=>{await assert.rejects(decodePath('맑은-하늘이-예쁜-바다를-그린다'));});