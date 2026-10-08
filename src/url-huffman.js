// Fixed URL-specific Huffman coding, deterministic across Cloudflare deployments.
// Symbols: ASCII 1..126, TOKENS indexed 128..254, EOS 255.
// Dictionary order and scoring are part of the version-5 protocol. Do not reorder.
export function createURLHuffman(tokens){
 if(tokens.length>127||new Set(tokens).size!==tokens.length)throw Error('Huffman token dictionary corrupted');
 const alphabet=Array.from({length:256},(_,id)=>{
  let w=1;
  if(id>=97&&id<=122)w=80;
  if('etaoinshrdlucmfwypvbgkqjxz'.includes(String.fromCharCode(id)))w=130;
  if(id>=48&&id<=57)w=70;
  if(id>=65&&id<=90)w=16;
  if('/.-_?=&:%+#@~'.includes(String.fromCharCode(id)))w=110;
  if(id===255)w=50;
  if(id>=128&&id<128+tokens.length){
   const token=tokens[id-128];
   w=token.includes('www.')||token.includes('.com')||token.includes('github')?110:token.length>=5?50:25;
  }
  return {id,w,left:null,right:null,min:id};
 }).filter(x=>(x.id>=1&&x.id<=126)||(x.id>=128&&x.id<128+tokens.length)||x.id===255);
 let nodes=alphabet;
 // Only ~256 symbols: sorting the small queue on initialisation is cheap.
 while(nodes.length>1){
  nodes.sort((a,b)=>a.w-b.w||a.min-b.min);
  const a=nodes.shift(),b=nodes.shift();
  nodes.push({id:-1,w:a.w+b.w,left:a,right:b,min:Math.min(a.min,b.min)});
 }
 const tree=nodes[0],codes=Array.from({length:256},()=>null);
 function walk(node,bits){
  if(node.id>=0){codes[node.id]=bits;return;}
  walk(node.left,bits+'0');walk(node.right,bits+'1');
 }
 walk(tree,'');
 const candidates=tokens.map((text,i)=>({text,id:128+i}));
 function encode(text){
  if([...text].some(c=>c.charCodeAt(0)<1||c.charCodeAt(0)>126))return null;
  // Weighted segmentation, rather than greedy-longest token replacement.
  const n=text.length,dp=Array(n+1).fill(Number.POSITIVE_INFINITY),next=Array(n);
  dp[n]=codes[255].length;
  for(let i=n-1;i>=0;i--){
   const id=text.charCodeAt(i);
   dp[i]=codes[id].length+dp[i+1];next[i]={id,len:1};
   for(const item of candidates)if(text.startsWith(item.text,i)){
    const size=codes[item.id].length+dp[i+item.text.length];
    if(size<dp[i]){dp[i]=size;next[i]={id:item.id,len:item.text.length};}
   }
  }
  const data=new Uint8Array(Math.ceil(dp[0]/8));let bit=0;
  function put(id){const bits=codes[id];for(const char of bits){if(char==='1')data[bit>>3]|=1<<(7-(bit&7));bit++;}}
  for(let i=0;i<n;){const p=next[i];put(p.id);i+=p.len;}
  put(255);
  return data;
 }
 function decode(bytes){
  let node=tree,text='',bit=0,done=false;
  for(;bit<bytes.length*8;bit++){
   node=((bytes[bit>>3]>>(7-(bit&7)))&1)?node.right:node.left;
   if(!node)throw Error('주소 허프만 트리 오류');
   if(node.id>=0){
    if(node.id===255){done=true;bit++;break;}
    if(node.id>=128)text+=tokens[node.id-128];
    else text+=String.fromCharCode(node.id);
    if(text.length>4096)throw Error('복원한 주소가 너무 깁니다.');
    node=tree;
   }
  }
  if(!done)throw Error('주소 압축 종료 표시가 없습니다.');
  for(;bit<bytes.length*8;bit++)if((bytes[bit>>3]>>(7-(bit&7)))&1)throw Error('잘못된 URL 압축 여분 비트');
  return text;
 }
 return {encode,decode};
}