import test from 'node:test';
import assert from 'node:assert/strict';
import { displayOrigin } from '../src/idn.js';

test('unicode origin 1', () => assert.equal(displayOrigin("https://xn--bj0b5d.xn--3e0b707e/api"), "https://글길.한국"));
test('unicode origin 2', () => assert.equal(displayOrigin("https://xn--bj0bv3c9z6c.xn--3e0b707e/api"), "https://한글날.한국"));
test('unicode origin 3', () => assert.equal(displayOrigin("https://xn--vv4b11d.xn--3e0b707e:8788/api"), "https://예시.한국:8788"));
test('unicode origin 4', () => assert.equal(displayOrigin("https://example.com/api"), "https://example.com"));
test('unicode origin 5', () => assert.equal(displayOrigin("http://localhost:8788/api"), "http://localhost:8788"));
test('unicode origin 6', () => assert.equal(displayOrigin("https://[::1]:8080/api"), "https://[::1]:8080"));
