import { nouns, adjectives, verbs } from './words.js';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8',{fatal:true});
const adjectiveForm = (a)=> ({'즐겁다':'즐거운','반갑다':'반가운','기쁘다':'기쁜','싱그럽다':'싱그러운','귀엽다':'귀여운','예쁘다':'예쁜','부드럽다':'부드러운','외롭다':'외로운','맑다':'맑은','작다':'작은','크다':'큰','깊다':'깊은','넓다':'넓은','높다':'높은','낮다':'낮은','오래다':'오랜'})[a] || a.slice(0,-1)+'은';
// Preserve exact vocabulary ordering; word form is uniquely decodable.
const adjs = adjectives.map(adjectiveForm);
const verbsForm = verbs.map(v => {
  const stem=v.slice(0,-1);
  return stem.endsWith('하') ? stem.slice(0,-1)+'한다' : stem+'는다';
});
// Explicit conjugations avoid irregular stems while staying within supplied dictionary forms.
const verbForms = verbs.map(v=>({
 '그리다':'그린다','떠올리다':'떠올린다','비추다':'비춘다','품다':'품는다','반기다':'반긴다','만나다':'만난다','느끼다':'느낀다','헤아리다':'헤아린다','찾다':'찾는다','안다':'안는다','잇다':'잇는다','따르다':'따른다','담다':'담는다','채우다':'채운다','기리다':'기린다','이루다':'이룬다'
})[v]);
function particle(word,hasCoda,withoutCoda){const t=word.charCodeAt(word.length-1)-0xac00;return t>=0&&t<11172&&t%28!==0?hasCoda:withoutCoda;}
const subject=nouns.map(w=>w+particle(w,'이','가'));
const object=nouns.map(w=>w+particle(w,'을','를'));
const aMap=new Map(adjs.map((w,i)=>[w,i])), nSubMap=new Map(subject.map((w,i)=>[w,i])), nObjMap=new Map(object.map((w,i)=>[w,i])),vMap=new Map(verbForms.map((w,i)=>[w,i]));
if([aMap,nSubMap,nObjMap,vMap].some((m,i)=>m.size!==[16,256,256,16][i])) throw Error('어휘 충돌');
const crc32=(bytes)=>{let c=-1; for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^(-(c&1)&0xedb88320);}return (c^-1)>>>0;};
const u32=(v)=>[(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255];
const getU32=(b,pos)=>(b[pos]*0x1000000 + (b[pos+1]<<16)+(b[pos+2]<<8)+b[pos+3])>>>0;
const MAX_URL_BYTES=4096,MAX_PATH_LENGTH=32000;
async function pack(url){
 let u;try{u=new URL(url);}catch{throw Error('올바른 주소를 입력해 주세요.');}
 if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw Error('http 또는 https 주소만 사용할 수 있습니다.');
 const input=enc.encode(u.href);if(input.length>MAX_URL_BYTES)throw Error('원본 주소는 4,096바이트 이하로 입력해 주세요.');
 let payload=input,mode=0;
 if(typeof CompressionStream!=='undefined'){
  const stream=new Blob([input]).stream().pipeThrough(new CompressionStream('deflate'));
  const zipped=new Uint8Array(await new Response(stream).arrayBuffer());
  if(zipped.length<input.length){payload=zipped;mode=1;}
 }
 return Uint8Array.from([1,mode,...u32(payload.length),...payload,...u32(crc32(input))]);
}
async function unpack(b){
 if(b.length<10||b[0]!==1||b[1]>1)throw Error('지원하지 않는 한글 주소입니다.');
 const l=getU32(b,2);if(l>MAX_URL_BYTES||b.length!==l+10)throw Error('주소 데이터 길이가 맞지 않습니다.');
 let bytes=b.slice(6,6+l);
 if(b[1]===1){if(typeof DecompressionStream==='undefined')throw Error('압축 해제를 지원하지 않습니다.');
 try{const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));bytes=new Uint8Array(await new Response(stream).arrayBuffer());}catch{throw Error('주소 압축 데이터가 손상되었습니다.');}}
 if(bytes.length>MAX_URL_BYTES||crc32(bytes)!==getU32(b,6+l))throw Error('주소 검증에 실패했습니다.');
 const url=dec.decode(bytes);let u;try{u=new URL(url);}catch{throw Error('주소 형식이 잘못되었습니다.');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('허용되지 않는 주소입니다.');
 return u.href;
}
export async function encodeURL(url){
 const bytes=await pack(url);
 let hex='';for(const b of bytes)hex+=b.toString(16).padStart(2,'0');
 let chunks=[];
 for(let i=0;i<hex.length;i+=7){
  const h=hex.slice(i,i+7).padEnd(7,'0');
  const a=+('0x'+h[0]),n=parseInt(h.slice(1,3),16),b=+('0x'+h[3]),o=parseInt(h.slice(4,6),16),v=+('0x'+h[6]);
  chunks.push(`${adjs[a]}-${subject[n]}-${adjs[b]}-${object[o]}-${verbForms[v]}`);
 }
 return '글길/'+chunks.join('/');
}
export async function decodePath(slug){
 if(slug.length>MAX_PATH_LENGTH)throw Error('주소가 너무 깁니다.');
 const chunks=slug.split('/');if(!chunks.length||chunks.some(c=>!c))throw Error('주소 형식이 올바르지 않습니다.');
 let hex='';for(const chunk of chunks){
  const parts=chunk.split('-');if(parts.length!==5)throw Error('문장 구조가 올바르지 않습니다.');
  const i=aMap.get(parts[0]),n=nSubMap.get(parts[1]),j=aMap.get(parts[2]),o=nObjMap.get(parts[3]),v=vMap.get(parts[4]);
  if([i,n,j,o,v].some(x=>x===undefined))throw Error('사전에 없는 문장이 포함되어 있습니다.');
  hex+=i.toString(16)+n.toString(16).padStart(2,'0')+j.toString(16)+o.toString(16).padStart(2,'0')+v.toString(16);
 }
 // Framing header determines actual byte count and padding; zero-padded final clause is ignored.
 if(hex.length<12)throw Error('주소가 완성되지 않았습니다.');
 const length=parseInt(hex.slice(4,12),16);const required=(length+10)*2;
 if(length>MAX_URL_BYTES||hex.length<required||hex.length-required>=7||!/^[0]*$/.test(hex.slice(required)))throw Error('주소 길이 또는 끝자리가 올바르지 않습니다.');
 hex=hex.slice(0,required);
 const bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);
 return unpack(bytes);
}