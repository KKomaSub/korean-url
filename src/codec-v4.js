import {nounsV3} from './words-v3.js';
import {choices,locate,themeWord,nounWord,themeId,nounId,THEMES_ORDER} from './semantic-graph.js';
import {unicodeHostname} from './idn.js';

// Immutable v4: graph-relative selection preserves information, while choosing
// connected semantic neighbours. v1, v2 and v3 decoders stay on the server.
const VERBS=[['잇고','잇다'],['열고','연다'],['키우고','키운다'],['밝히고','밝힌다'],
 ['기리고','기린다'],['넓히고','넓힌다'],['세우고','세운다'],['지키고','지킨다'],
 ['펴고','편다'],['만들고','만든다'],['돌보고','돌본다'],['가꾸고','가꾼다'],
 ['전하고','전한다'],['높이고','높인다'],['살리고','살린다'],['나누고','나눈다']];
const VMAP=new Map();VERBS.forEach((pair,i)=>pair.forEach((str,final)=>VMAP.set(str,{index:i,final:!!final})));
const VERB_ENDS=[...VMAP.keys()].sort((a,b)=>b.length-a.length);
const TOKENS = [
 'www.google.com', 'www.youtube.com', 'www.github.com', 'www.naver.com', 'github.com', 'youtube.com',
 'google.com', 'naver.com', 'example.com', 'wikipedia.org', 'instagram.com', 'cloudflare.com',
 'openai.com', 'facebook.com', 'kakao.com', 'kkomaweb.com', 'githubusercontent.com', 'tistory.com',
 'blog.naver.com', 'www.', '/search?q=', '/watch?v=', '/issues/', '/pull/',
 '/blob/', '/tree/', '/wiki/', '/api/', '/post/', '/article/',
 '.co.kr', '.com', '.org', '.net', '.edu', '.gov',
 '.app', '.dev', '.io', '.kr', '.html', '.php',
 '.json', '.js', '.css', '.png', '.jpg', '.pdf',
 'index.html', '?q=', '&q=', '?id=', '&id=', '?page=',
 'xn--', '%EA', '%EB', '%EC', '%ED', '%EE',
 '%F0', '%80', '%81', '%82', '%83', '%84',
 '%85', '%86', '%87', '%88', '%89', '%8A',
 '%8B', '%8C', '%8D', '%8E', '%8F', '%90',
 '%91', '%92', '%93', '%94', '%95', '%96',
 '%97', '%98', '%99', '%9A', '%9B', '%9C',
 '%9D', '%9E', '%9F', '%A0', '%A1', '%A2',
 '%A3', '%A4', '%A5', '%A6', '%A7', '%A8',
 '%A9', '%AA', '%AB', '%AC', '%AD', '%AE',
 '%AF', '%B0', '%B1', '%B2', '%B3', '%B4',
 '%B5', '%B6', '%B7', '%B8', '%B9', '%BA',
 '%BB', '%BC', '%BD', '%BE', '%BF',
];
if(TOKENS.length>127||new Set(TOKENS).size!==TOKENS.length)throw Error('URL 압축 사전 손상');
const MATCH_TOKENS = TOKENS.map((s,i)=>[s,i+1]).sort((a,b)=>b[0].length-a[0].length);
const MAX_URL_BYTES=4096,MAX_SLUG=25000,BASE=1n<<36n,MASK=255n;
const HOSTS=[
 'example.com','github.com','www.github.com','www.google.com','google.com',
 'www.youtube.com','youtube.com','www.naver.com','naver.com','blog.naver.com',
 'wikipedia.org','ko.wikipedia.org','openai.com','www.openai.com',
 'cloudflare.com','www.cloudflare.com','kkomaweb.com','www.kkomaweb.com',
 'instagram.com','www.instagram.com','kakao.com','www.kakao.com',
 '한글날.한국','글길.한국','대한민국.한국','naver.me',
 'example.org','example.net','localhost',
 'www.daum.net','daum.net','google.co.kr','www.google.co.kr',
 'github.io','pages.dev','www.reddit.com','reddit.com',
 'twitter.com','x.com','tistory.com','www.tistory.com'
];
if(new Set(HOSTS).size!==HOSTS.length||HOSTS.length>255)throw Error('호스트 사전 손상');
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
function normalizeURL(value){
 if(typeof value!=='string')throw Error('주소를 입력해 주세요.');
 let s=value.trim();
 if(!s||/[\u0000-\u001f\u007f]/.test(s))throw Error('올바른 주소를 입력해 주세요.');
 if(!/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(s)){
  if(/^[A-Za-z][A-Za-z\d+.-]*:/.test(s))throw Error('http 또는 https 주소만 사용할 수 있습니다.');
  s='https://'+s;
 }
 let u;try{u=new URL(s);}catch{throw Error('올바른 주소를 입력해 주세요.');}
 if(!['https:','http:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw Error('http 또는 https 주소만 사용할 수 있습니다.');
 return u.href;
}
// Canonical URL text is ASCII-heavy (Punycode and %HH). For new v3 slugs,
// recover Unicode spelling only when WHATWG normalization returns the exact original.
function readableUnicode(text){
 return text.replace(/(?:%[0-9A-F]{2})+/g,sequence=>{
  const chunks=sequence.match(/%[0-9A-F]{2}/g)||[];
  const bytes=chunks.map(c=>parseInt(c.slice(1),16));
  let out='';
  for(let i=0;i<bytes.length;){
   const b=bytes[i];let size=0;
   if(b>=0xc2&&b<=0xdf)size=2;
   else if(b>=0xe0&&b<=0xef)size=3;
   else if(b>=0xf0&&b<=0xf4)size=4;
   if(size&&i+size<=bytes.length&&bytes.slice(i+1,i+size).every(x=>x>=0x80&&x<=0xbf)){
    try{const segment=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes.slice(i,i+size)));
     if(segment&&[...segment].every(ch=>ch.codePointAt(0)>=0x80)){
      out+=segment;i+=size;continue;
     }
    }catch{}
   }
   out+=chunks[i++];
  }
  return out;
 });
}
function shortenedBody(original){
 const parsed=new URL(original);
 const host=unicodeHostname(parsed.hostname)+(parsed.port?':'+parsed.port:'');
 const body=host+readableUnicode(parsed.pathname+parsed.search+parsed.hash);
 const scheme=original.startsWith('https://')?'https://':'http://';
 return normalizeURL(scheme+body)===original?body:original.slice(scheme.length);
}
function crc32(bytes){let c=-1;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^-1)>>>0;}
function particle(word,withConsonant,withoutConsonant){const end=word.charCodeAt(word.length-1)-0xac00;return end%28?withConsonant:withoutConsonant;}
function tokenEncode(text){
 const codes=[];
 for(let i=0;i<text.length;){
  let match=false;
  for(const [token,index] of MATCH_TOKENS){if(text.startsWith(token,i)){codes.push(0,index);i+=token.length;match=true;break;}}
  if(match)continue;
  const cc=text.charCodeAt(i++);
  if(cc<1||cc>126)return null;
  codes.push(cc);
 }
 codes.push(127); // explicit terminator, no two-byte length header.
 const out=new Uint8Array(Math.ceil(codes.length*7/8));
 for(let bit=0,i=0;i<codes.length;i++)for(let shift=6;shift>=0;shift--,bit++)
  if(codes[i]&(1<<shift))out[bit>>3]|=1<<(7-(bit&7));
 return out;
}
function tokenDecode(bytes){
 let out='',at=0,escaped=false,finished=false;
 for(let b=0;b+7<=bytes.length*8;b+=7){
  let code=0;for(let j=0;j<7;j++)code=(code<<1)|((bytes[(b+j)>>3]>>(7-((b+j)&7)))&1);
  at=b+7;
  if(escaped){if(code===0||code>TOKENS.length)throw Error('단어 압축 코드 손상');out+=TOKENS[code-1];escaped=false;}
  else if(code===127){finished=true;break;}
  else if(code===0)escaped=true;
  else out+=String.fromCharCode(code);
  if(out.length>MAX_URL_BYTES)throw Error('주소 길이 초과');
 }
 if(!finished||escaped)throw Error('압축 종료 표시가 없습니다.');
 for(let b=at;b<bytes.length*8;b++)if((bytes[b>>3]>>(7-(b&7)))&1)throw Error('압축 여분 비트 손상');
 return enc.encode(out);
}
const ALPHABET="abcdefghijklmnopqrstuvwxyz0123456789-._~/?:=&%+#@,;!$()*";
const ALPHAMAP=new Map([...ALPHABET].map((c,i)=>[c,i]));
function sixEncode(text){
 let bits=[];
 function push(n,size){for(let j=size-1;j>=0;j--)bits.push((n>>j)&1);}
 for(const ch of text){
  const idx=ALPHAMAP.get(ch);
  if(idx!==undefined)push(idx,6);
  else{const code=ch.charCodeAt(0);if(code<1||code>127)return null;push(62,6);push(code,7);}
 }
 push(63,6);
 const data=new Uint8Array(Math.ceil(bits.length/8));bits.forEach((x,i)=>data[i>>3]|=x<<(7-(i&7)));
 return data;
}
function sixDecode(data){
 let at=0,out='',finished=false;
 function read(n){if(at+n>data.length*8)throw Error('압축 데이터가 잘렸습니다.');let v=0;for(let j=0;j<n;j++,at++)v=(v<<1)|((data[at>>3]>>(7-(at&7)))&1);return v;}
 while(at+6<=data.length*8){
  const n=read(6);
  if(n===63){finished=true;break;}
  if(n===62)out+=String.fromCharCode(read(7));
  else{if(n>=ALPHABET.length)throw Error('압축 알파벳 손상');out+=ALPHABET[n];}
  if(out.length>MAX_URL_BYTES)throw Error('주소 길이 초과');
 }
 if(!finished)throw Error('압축 종료 표시가 없습니다.');
 while(at<data.length*8)if(read(1))throw Error('압축 여분 비트 손상');
 return enc.encode(out);
}
async function compress(bytes){
 if(typeof CompressionStream==='undefined')return null;
 const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function decompress(bytes){
 if(typeof DecompressionStream==='undefined')throw Error('압축 해제를 지원하지 않습니다.');
 try{
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader=stream.getReader(),chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;
   size+=value.length;if(size>MAX_URL_BYTES){await reader.cancel();throw Error('압축 해제 용량 초과');}chunks.push(value);}
  const result=new Uint8Array(size);let p=0;
  for(const chunk of chunks){result.set(chunk,p);p+=chunk.length;}return result;
 }catch{throw Error('손상된 압축 주소입니다.');}
}
function bytesToBigint(bytes){let n=0n;for(const b of bytes)n=(n<<8n)|BigInt(b);return n;}
function bigintToBytes(value){if(value===0n)return Uint8Array.of(0);const out=[];for(let n=value;n>0n;n>>=8n)out.push(Number(n&255n));return Uint8Array.from(out.reverse());}
// A full clause: 8-bit theme, three context-dependent 8-bit semantic edges,
// four-bit positive verb = 36 bits. A final clause may have a shorter grammar.
function clause(value,final,context){
 if(final&&value<512n){const w=nounWord(Number(value));return w+particle(w,'이','가')+'빛난다';}
 if(final&&value<(1n<<18n)){
  const a=Number(value>>9n),b=Number(value&511n);
  const aw=nounWord(a),bw=nounWord(b);
  return aw+particle(aw,'이','가')+bw+particle(bw,'을','를')+'잇다';
 }
 if(final&&value<(1n<<27n)){
  const a=Number(value>>18n),b=Number((value>>9n)&511n),c=Number(value&511n);
  const aw=nounWord(a),bw=nounWord(b),cw=nounWord(c);
  return aw+particle(aw,'이','가')+bw+particle(bw,'과','와')+cw+particle(cw,'을','를')+'잇다';
 }
 const t=Number((value>>28n)&255n),a=Number((value>>20n)&255n),b=Number((value>>12n)&255n),c=Number((value>>4n)&255n),v=Number(value&15n);
 const s=choices(t,0,[],context)[a],o=choices(t,1,[s],context)[b],g=choices(t,2,[s,o],context)[c];
 const sw=nounWord(s),ow=nounWord(o),gw=nounWord(g);
 // '조선의 문화가 과학과 미래를 잇고', '한글의 연구가 기술과 역사를 잇다'.
 return themeWord(t,context)+'의'+sw+particle(sw,'이','가')+ow+particle(ow,'과','와')+gw+particle(gw,'을','를')+VERBS[v][final?1:0];
}
function readClause(text,at,context){
 // Check the grammatical marker after the initial word. No ambiguous splits.
 // Variable terminal clauses have no '의' after the leading two-syllable noun.
 const first=nounId(text.slice(at,at+2));
 if(first>=0&&text[at+2]===particle(nounWord(first),'이','가')){
  let pos=at+3;
  if(text.startsWith('빛난다',pos))return {value:BigInt(first),last:true,next:pos+3,context};
  const second=nounId(text.slice(pos,pos+2));pos+=2;
  if(second>=0&&text[pos]===particle(nounWord(second),'을','를')&&text.startsWith('잇다',pos+1))
   return {value:BigInt(first)<<9n|BigInt(second),last:true,next:pos+3,context};
  if(second>=0&&text[pos]===particle(nounWord(second),'과','와')){
   pos++;
   const third=nounId(text.slice(pos,pos+2));pos+=2;
   if(third>=0&&text[pos]===particle(nounWord(third),'을','를')&&text.startsWith('잇다',pos+1))
    return {value:BigInt(first)<<18n|BigInt(second)<<9n|BigInt(third),last:true,next:pos+3,context};
  }
 }
 let root=text.slice(at,at+2),t=themeId(root,context);
 if(t<0||text[at+2]!=='의')throw Error('문장 주제를 인식하지 못했습니다.');
 let pos=at+3;
 const sw=text.slice(pos,pos+2),s=nounId(sw);pos+=2;
 if(s<0||text[pos++]!==particle(sw,'이','가'))throw Error('주어 관계 오류');
 const ow=text.slice(pos,pos+2),o=nounId(ow);pos+=2;
 if(o<0||text[pos++]!==particle(ow,'과','와'))throw Error('관련 개념 관계 오류');
 const gw=text.slice(pos,pos+2),g=nounId(gw);pos+=2;
 if(o<0||g<0||text[pos++]!==particle(gw,'을','를'))throw Error('목적어 관계 오류');
 let v,ending;
 for(const form of VERB_ENDS)if(text.startsWith(form,pos)){v=VMAP.get(form);ending=form;break;}
 if(!v)throw Error('서술어 인식 오류');
 pos+=ending.length;
 const a=locate(choices(t,0,[],context),s);
 const b=locate(choices(t,1,[s],context),o);
 const c=locate(choices(t,2,[s,o],context),g);
 if(a<0||b<0||c<0)throw Error('문장 의미 관계 오류');
 return {value:BigInt(t)<<28n|BigInt(a)<<20n|BigInt(b)<<12n|BigInt(c)<<4n|BigInt(v.index),last:v.final,next:pos,context:g};
}

export async function encodeURLv4(value){
 const original=normalizeURL(value),raw=enc.encode(original);
 if(raw.length>MAX_URL_BYTES)throw Error('원본 주소는 4,096바이트 이하로 입력해 주세요.');
 const https=original.startsWith('https://');
 const body=shortenedBody(original),plain=enc.encode(body);
 const options=[{format:0,data:plain}];
 const parsed=new URL(original),host=unicodeHostname(parsed.hostname)+(parsed.port?':'+parsed.port:'');
 const hostId=HOSTS.indexOf(host);
 if(hostId>=0){
  let path=body.slice(host.length);
  if(path==='/')path='';
  const rawPath=enc.encode(path);
  options.push({format:6,data:Uint8Array.from([hostId,...rawPath])});
  const hostToken=tokenEncode(path);if(hostToken)options.push({format:4,data:Uint8Array.from([hostId,...hostToken])});
  const hostSix=sixEncode(path);if(hostSix)options.push({format:5,data:Uint8Array.from([hostId,...hostSix])});
  if(rawPath.length>=30){const zp=await compress(rawPath);if(zp)options.push({format:7,data:Uint8Array.from([hostId,...zp])});}
 }
 const token=tokenEncode(body);if(token)options.push({format:1,data:token});
 const six=sixEncode(body);if(six)options.push({format:2,data:six});
 if(plain.length>=36){const zipped=await compress(plain);if(zipped)options.push({format:3,data:zipped});}
 const best=options.reduce((a,b)=>b.data.length<a.data.length?b:a);
 const frame=new Uint8Array(best.data.length+5);
 frame[0]=0xd0+(https?0:1)+(best.format<<1);
 frame.set(best.data,1);
 const check=crc32(raw);
 frame.set([check>>>24,(check>>>16)&255,(check>>>8)&255,check&255],best.data.length+1);
 let n=bytesToBigint(frame);const digits=[];
 do{digits.push(n&(BASE-1n));n>>=36n;}while(n>0n);
 let context=0;
 const out=[];
 for(let i=0;i<digits.length;i++){
  const part=clause(digits[i],i===digits.length-1,context);
  out.push(part);
  if(i!==digits.length-1||digits[i]>=(1n<<27n)){
   const t=Number((digits[i]>>28n)&255n),a=Number((digits[i]>>20n)&255n),b=Number((digits[i]>>12n)&255n),c=Number((digits[i]>>4n)&255n);
   const s=choices(t,0,[],context)[a],o=choices(t,1,[s],context)[b];
   context=choices(t,2,[s,o],context)[c];
  }
 }
 return out.join('');
}
export async function decodeURLv4(slug){
 if(typeof slug!=='string'||!slug||slug.length>MAX_SLUG||!/^[가-힣]+$/.test(slug))throw Error('한글 주소 형식 오류');
 const digits=[];let pos=0,context=0,done=false;
 while(pos<slug.length){
  const result=readClause(slug,pos,context);
  pos=result.next;context=result.context;digits.push(result.value);
  if(result.last){done=true;break;}
  if(digits.length>800)throw Error('주소가 너무 깁니다.');
 }
 if(!done||pos!==slug.length)throw Error('문장의 끝이 올바르지 않습니다.');
 let n=0n;for(let i=digits.length-1;i>=0;i--)n=(n<<36n)|digits[i];
 const frame=bigintToBytes(n);
 if(frame.length<6||frame[0]<0xd0||frame[0]>0xdf)throw Error('지원하지 않는 주소 버전입니다.');
 const flag=frame[0]-0xd0,http=!!(flag&1),format=flag>>1;
 let body=frame.slice(1,-4);
 if(body.length>MAX_URL_BYTES*2)throw Error('주소가 너무 깁니다.');
 if(format===1)body=tokenDecode(body);
 else if(format===2)body=sixDecode(body);
 else if(format===3)body=await decompress(body);
 else if(format>=4&&format<=7){
  if(body.length<1||body[0]>=HOSTS.length)throw Error('등록된 호스트 형식 오류');
  const host=HOSTS[body[0]],path=body.slice(1);
  if(format===4)body=tokenDecode(path);
  else if(format===5)body=sixDecode(path);
  else if(format===6)body=path;
  else body=await decompress(path);
  const tail=dec.decode(body);
  body=enc.encode(host+(tail||'/'));
 }
 else if(format!==0)throw Error('알 수 없는 압축 형식입니다.');
 const restored=(http?'http://':'https://')+dec.decode(body);
 const canonical=normalizeURL(restored),raw=enc.encode(canonical);
 if(raw.length>MAX_URL_BYTES)throw Error('복원한 주소가 너무 깁니다.');
 const p=frame.length-4,crc=((frame[p]*0x1000000)+(frame[p+1]<<16)+(frame[p+2]<<8)+frame[p+3])>>>0;
 if(crc32(raw)!==crc)throw Error('주소 무결성 검증 실패');
 return canonical;
}