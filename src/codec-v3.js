import {nounsV3,themesV3} from './words-v3.js';
import {unicodeHostname} from './idn.js';
// Every clause carries 39 bits: 8 (theme) + 9*3 (nouns) + 4 (verb).
// Surface grammar: [historical/cultural theme][noun]이/가[noun][noun]을/를[verb].
// Keep the fixed lexicons immutable so no database is necessary.
const VERBS = [
 ['쓰고','쓴다'],['열고','연다'],['잇고','잇다'],['펴고','편다'],
 ['내고','낸다'],['쌓고','쌓다'],['담고','담다'],['품고','품다'],
 ['짓고','짓다'],['돕고','돕다'],['안고','안다'],['맺고','맺다'],
 ['얻고','얻다'],['찾고','찾다'],['보고','본다'],['읽고','읽다']
];
const EPILOGUES = [
 '한글의뜻을잇다','세종대왕을기린다','훈민정음을기린다','조선의과학이빛난다',
 '대한민국이발전한다','한글날을기린다','우리말을사랑한다','조선문화를이어간다',
 '한글로미래를쓴다','한국의기술이빛난다','세종의지혜가빛난다','우리역사를이어간다',
 '한글의가치를기린다','조선의미래를열다','세상의꿈을잇다','대한의희망을노래한다'
];
const EPILOGUE_MAP=new Map(EPILOGUES.map((v,i)=>[v,i]));
const TOKENS = [
 'www.google.com','www.youtube.com','www.github.com','www.naver.com','github.com','youtube.com',
 'google.com','naver.com','example.com','wikipedia.org','instagram.com','cloudflare.com',
 'openai.com','facebook.com','kakao.com','kkomaweb.com','githubusercontent.com','tistory.com',
 'blog.naver.com','www.','/search?q=','/watch?v=','/issues/','/pull/',
 '/blob/','/tree/','/wiki/','/api/','/post/','/article/',
 '.co.kr','.com','.org','.net','.edu','.gov',
 '.app','.dev','.io','.kr','.html','.php',
 '.json','.js','.css','.png','.jpg','.pdf',
 'index.html','?q=','&q=','?id=','&id=','?page=',
 'xn--','%EA','%EB','%EC','%ED','%EE',
 '%F0',...Array.from({length:64},(_,i)=>'%'+(0x80+i).toString(16).toUpperCase().padStart(2,'0'))
];
if(TOKENS.length>127||new Set(TOKENS).size!==TOKENS.length)throw Error('URL 압축 사전 손상');
const MATCH_TOKENS=TOKENS.map((s,i)=>[s,i+1]).sort((a,b)=>b[0].length-a[0].length);
const NMAP=new Map(nounsV3.map((w,i)=>[w,i]));
const THEME_MAP=new Map(themesV3.map((w,i)=>[w,i]));
const THEMES_SORTED=[...themesV3].sort((a,b)=>b.length-a.length);
const VMAP=new Map();
VERBS.forEach((pair,i)=>pair.forEach((v,last)=>VMAP.set(v,{i,last:!!last})));
if(NMAP.size!==512||THEME_MAP.size!==256||VMAP.size!==32)throw Error('한글 문장 사전 손상');
const MAX_URL_BYTES=4096,MAX_SLUG=25000,BASE=1n<<39n,MASK=511n;
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
// Encode Unicode hostnames and URL-escaped non-ASCII paths as UTF-8 when a
// canonicalization check proves that their exact target URL is unchanged.
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
function asciiTokens(s){
 const codes=[];
 for(let i=0;i<s.length;){
  let found=false;
  for(const [token,index] of MATCH_TOKENS){if(s.startsWith(token,i)){codes.push(0,index);i+=token.length;found=true;break;}}
  if(found)continue;
  const char=s.charCodeAt(i++);
  if(char<1||char>127)return null;
  codes.push(char);
 }
 if(codes.length>65535)return null;
 const body=new Uint8Array(2+Math.ceil(codes.length*7/8));
 body[0]=codes.length>>>8;body[1]=codes.length&255;
 for(let i=0,bit=0;i<codes.length;i++){
  const digit=codes[i];
  for(let shift=6;shift>=0;shift--,bit++)if(digit&(1<<shift))body[2+(bit>>3)]|=1<<(7-(bit&7));
 }
 return body;
}
function fromAsciiTokens(bytes){
 if(bytes.length<2)throw Error('압축한 주소가 손상되었습니다.');
 const count=(bytes[0]<<8)|bytes[1],needed=2+Math.ceil(count*7/8);
 if(count>MAX_URL_BYTES*2||bytes.length!==needed)throw Error('압축한 주소 길이가 올바르지 않습니다.');
 const codes=[];
 for(let bit=0,i=0;i<count;i++){
  let code=0;
  for(let j=0;j<7;j++,bit++)code=(code<<1)|((bytes[2+(bit>>3)]>>(7-(bit&7)))&1);
  codes.push(code);
 }
 let text='';
 for(let i=0;i<codes.length;i++){
  if(codes[i]===0){const key=codes[++i];if(key===undefined||key===0||key>TOKENS.length)throw Error('URL 압축 사전 코드가 올바르지 않습니다.');text+=TOKENS[key-1];}
  else text+=String.fromCharCode(codes[i]);
  if(text.length>MAX_URL_BYTES)throw Error('복원한 주소가 너무 깁니다.');
 }
 return enc.encode(text);
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
function makeClause(value,isLast){
 if(isLast&&value<16n)return EPILOGUES[Number(value)];
 const theme=Number((value>>31n)&255n),a=Number((value>>22n)&MASK);
 const b=Number((value>>13n)&MASK),c=Number((value>>4n)&MASK),v=Number(value&15n);
 return themesV3[theme]+nounsV3[a]+particle(nounsV3[a],'이','가')+
        nounsV3[b]+nounsV3[c]+particle(nounsV3[c],'을','를')+VERBS[v][isLast?1:0];
}
function readClause(slug,at){
 for(const phrase of EPILOGUES){if(slug.startsWith(phrase,at))return {value:BigInt(EPILOGUE_MAP.get(phrase)),last:true,next:at+phrase.length};}
 let theme;
 for(const s of THEMES_SORTED){if(slug.startsWith(s,at)){theme=s;break;}}
 if(!theme)throw Error('주제어를 찾지 못했습니다.');
 let pos=at+theme.length;
 const a=NMAP.get(slug.slice(pos,pos+2));pos+=2;
 if(a===undefined||slug[pos++]!==particle(nounsV3[a],'이','가'))throw Error('주격 단어가 올바르지 않습니다.');
 const b=NMAP.get(slug.slice(pos,pos+2));pos+=2;
 const c=NMAP.get(slug.slice(pos,pos+2));pos+=2;
 if(b===undefined||c===undefined||slug[pos++]!==particle(nounsV3[c],'을','를'))throw Error('목적격 단어가 올바르지 않습니다.');
 const verb=VMAP.get(slug.slice(pos,pos+2));pos+=2;
 if(!verb)throw Error('동사 형태가 올바르지 않습니다.');
 return {value:BigInt(THEME_MAP.get(theme))<<31n|BigInt(a)<<22n|BigInt(b)<<13n|BigInt(c)<<4n|BigInt(verb.i),last:verb.last,next:pos};
}
export async function encodeURLv3(value){
 const original=normalizeURL(value),raw=enc.encode(original);
 if(raw.length>MAX_URL_BYTES)throw Error('원본 주소는 4,096바이트 이하로 입력해 주세요.');
 const https=original.startsWith('https://');
 const body=shortenedBody(original),plain=enc.encode(body);
 let best=asciiTokens(body),format=0;
 if(!best||plain.length<best.length){best=plain;format=2;}
 if(plain.length>=42){const zipped=await compress(plain);if(zipped&&zipped.length<best.length){best=zipped;format=1;}}
 const frame=new Uint8Array(best.length+5);
 frame[0]=0xc0+(https?0:1)+(format<<1);
 frame.set(best,1);
 const check=crc32(raw);
 frame.set([check>>>24,(check>>>16)&255,(check>>>8)&255,check&255],best.length+1);
 let n=bytesToBigint(frame);const digits=[];
 do{digits.push(n&(BASE-1n));n>>=39n;}while(n>0n);
 return digits.map((digit,i)=>makeClause(digit,i===digits.length-1)).join('');
}
export async function decodeURLv3(slug){
 if(typeof slug!=='string'||!slug||slug.length>MAX_SLUG||!/^[가-힣]+$/.test(slug))throw Error('한글 주소 형식이 올바르지 않습니다.');
 let at=0;const digits=[];let done=false;
 while(at<slug.length){
  const clause=readClause(slug,at);digits.push(clause.value);at=clause.next;
  if(clause.last){done=true;break;}
  if(digits.length>800)throw Error('너무 긴 주소입니다.');
 }
 if(!done||at!==slug.length)throw Error('한글 문장의 끝이 올바르지 않습니다.');
 let n=0n;for(let i=digits.length-1;i>=0;i--)n=(n<<39n)|digits[i];
 const frame=bigintToBytes(n);
 if(frame.length<6||frame[0]<0xc0||frame[0]>0xc5)throw Error('지원하지 않는 한글 주소 버전입니다.');
 const flags=frame[0]-0xc0,isHttp=!!(flags&1),format=flags>>1;
 let bytes=frame.slice(1,-4);
 if(bytes.length>MAX_URL_BYTES*2)throw Error('한글 주소가 너무 깁니다.');
 if(format===0)bytes=fromAsciiTokens(bytes);
 else if(format===1)bytes=await decompress(bytes);
 else if(format!==2)throw Error('지원하지 않는 압축 형식입니다.');
 const url=(isHttp?'http://':'https://')+dec.decode(bytes);
 const canonical=normalizeURL(url),raw=enc.encode(canonical);
 if(raw.length>MAX_URL_BYTES)throw Error('한글 주소가 너무 깁니다.');
 const p=frame.length-4,check=((frame[p]*0x1000000)+(frame[p+1]<<16)+(frame[p+2]<<8)+frame[p+3])>>>0;
 if(crc32(raw)!==check)throw Error('주소 검증에 실패했습니다.');
 return canonical;
}
