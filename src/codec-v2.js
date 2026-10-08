import { nounsV2 } from './words-v2.js';

// A clause: [noun]의[noun]이/가[noun]의[noun]을/를[verb-며/verb-다]
// 4096^4 * 16 = 2^52 possible values per clause, without separators.
const verbs = [
  ['그리며','그린다'],['떠올리며','떠올린다'],['비추며','비춘다'],
  ['품으며','품는다'],['반기며','반긴다'],['만나며','만난다'],
  ['느끼며','느낀다'],['헤아리며','헤아린다'],['찾으며','찾는다'],
  ['안으며','안는다'],['이으며','잇는다'],['따르며','따른다'],
  ['담으며','담는다'],['채우며','채운다'],['기리며','기린다'],['이루며','이룬다']
];
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal:true});
const WORD_MAP = new Map(nounsV2.map((word, idx)=>[word,idx]));
if (WORD_MAP.size!==4096 || nounsV2.some(w=>!/^[가-힣]{2}$/.test(w))) throw Error('한글 사전 손상');
const VERBS_MAP = new Map();
verbs.forEach((pair,index)=>pair.forEach((form,last)=>VERBS_MAP.set(form,{index,last:!!last})));
const VERBS_SORTED = [...VERBS_MAP.keys()].sort((a,b)=>b.length-a.length);
const BASE=1n<<52n, MASK=(1n<<12n)-1n;
const MAX_URL_BYTES=4096,MAX_SLUG=25000;
function particle(word,yes,no){const c=word.charCodeAt(1)-0xac00;return c%28 ? yes : no;}
function crc32(bytes){let c=-1;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^-1)>>>0;}
function normalizeURL(value){
 if(typeof value!=='string')throw Error('주소를 입력해 주세요.');
 let s=value.trim();
 if(!s || /[\u0000-\u001f\u007f]/.test(s))throw Error('올바른 주소를 입력해 주세요.');
 if(!/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(s)){
   if(/^[A-Za-z][A-Za-z\d+.-]*:/.test(s))throw Error('http 또는 https 주소만 사용할 수 있습니다.');
   s='https://'+s;
 }
 let u;try{u=new URL(s);}catch{throw Error('올바른 주소를 입력해 주세요.');}
 if(!['https:','http:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw Error('http 또는 https 주소만 사용할 수 있습니다.');
 return u.href;
}
async function compress(bytes){
 if(typeof CompressionStream==='undefined')return null;
 const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function decompress(bytes){
 if(typeof DecompressionStream==='undefined')throw Error('압축 해제를 지원하지 않습니다.');
 try{const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
 const reader=stream.getReader();let chunks=[],size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;
  if(size>MAX_URL_BYTES){await reader.cancel();throw Error('압축 해제 용량 초과');}chunks.push(value);}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return all;
 }catch{throw Error('손상된 압축 주소입니다.');}
}
function blobToInt(bytes){let h='';for(const byte of bytes)h+=byte.toString(16).padStart(2,'0');return BigInt('0x'+h);}
function intToBlob(n){let h=n.toString(16);if(h.length%2)h='0'+h;const bytes=new Uint8Array(h.length/2);
 for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(h.slice(i*2,i*2+2),16);return bytes;}
function clause(value,last){
 const a=Number((value>>40n)&MASK),b=Number((value>>28n)&MASK);
 const c=Number((value>>16n)&MASK),d=Number((value>>4n)&MASK),v=Number(value&15n);
 return nounsV2[a]+'의'+nounsV2[b]+particle(nounsV2[b],'이','가')+
   nounsV2[c]+'의'+nounsV2[d]+particle(nounsV2[d],'을','를')+verbs[v][last?1:0];
}
export async function encodeURL(url){
 const original=normalizeURL(url),raw=enc.encode(original);
 if(raw.length>MAX_URL_BYTES)throw Error('원본 주소는 4,096바이트 이하로 입력해 주세요.');
 const https=original.startsWith('https://'), body=enc.encode(original.slice(https?8:7));
 let bytes=body, zipped=false;
 if(body.length>=48){const z=await compress(body);if(z&&z.length<body.length){bytes=z;zipped=true;}}
 const check=crc32(raw);
 const packed=new Uint8Array(bytes.length+5);
 packed[0]=0xb0+(https?0:1)+(zipped?2:0);packed.set(bytes,1);
 packed.set([(check>>>24)&255,(check>>>16)&255,(check>>>8)&255,check&255],bytes.length+1);
 let n=blobToInt(packed),out=[];
 do{out.push(n & (BASE-1n));n>>=52n;}while(n>0n);
 return out.map((chunk,i)=>clause(chunk,i===out.length-1)).join('');
}
function parseClause(s,start){
 // Each noun is exactly two Hangul syllables, with a fixed-position grammatical particle.
 if(start+12>s.length)throw Error('한글 문장의 일부가 없습니다.');
 const a=WORD_MAP.get(s.slice(start,start+2)), b=WORD_MAP.get(s.slice(start+3,start+5));
 const c=WORD_MAP.get(s.slice(start+6,start+8)), d=WORD_MAP.get(s.slice(start+9,start+11));
 if([a,b,c,d].some(x=>x===undefined))throw Error('사전에 없는 단어가 있습니다.');
 if(s[start+2]!=='의'||s[start+5]!==particle(nounsV2[b],'이','가')||
    s[start+8]!=='의'||s[start+11]!==particle(nounsV2[d],'을','를'))throw Error('조사 형태가 올바르지 않습니다.');
 let matched=null;
 for(const form of VERBS_SORTED){if(s.startsWith(form,start+12)){matched={...VERBS_MAP.get(form),length:12+form.length};break;}}
 if(!matched)throw Error('동사 형태가 올바르지 않습니다.');
 const value=(BigInt(a)<<40n)|(BigInt(b)<<28n)|(BigInt(c)<<16n)|(BigInt(d)<<4n)|BigInt(matched.index);
 return {...matched,value};
}
export async function decodeURL(slug){
 if(typeof slug!=='string'||!slug||slug.length>MAX_SLUG||!/^[가-힣]+$/.test(slug))throw Error('한글 주소 형식이 올바르지 않습니다.');
 const digits=[];let cursor=0,last=false;
 while(cursor<slug.length){
  const c=parseClause(slug,cursor);digits.push(c.value);cursor+=c.length;
  if(c.last){last=true;break;}
  if(digits.length>800)throw Error('너무 긴 주소입니다.');
 }
 if(!last||cursor!==slug.length)throw Error('주소 문장의 끝이 올바르지 않습니다.');
 let n=0n;for(let i=digits.length-1;i>=0;i--)n=(n<<52n)|digits[i];
 const blob=intToBlob(n);
 if(blob.length<6 || blob[0]<0xb0||blob[0]>0xb3)throw Error('지원하지 않는 주소 버전입니다.');
 const mode=blob[0]-0xb0,isHttp=!!(mode&1),isZip=!!(mode&2);
 let body=blob.slice(1,-4);
 if(body.length>MAX_URL_BYTES)throw Error('주소가 너무 깁니다.');
 if(isZip)body=await decompress(body);
 const url=(isHttp?'http://':'https://')+dec.decode(body);
 const canonical=normalizeURL(url),raw=enc.encode(canonical);
 if(raw.length>MAX_URL_BYTES)throw Error('주소가 너무 깁니다.');
 const p=blob.length-4,checksum=((blob[p]*0x1000000)+(blob[p+1]<<16)+(blob[p+2]<<8)+blob[p+3])>>>0;
 if(crc32(raw)!==checksum)throw Error('주소 검증에 실패했습니다.');
 return canonical;
}
export const encodePath=encodeURL;