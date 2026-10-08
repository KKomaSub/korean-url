import {glosses} from './meaning.js';

const removeMarkup=x=>String(x).replace(/<[^>]*>/g,'').replace(/&(?:nbsp|amp|lt|gt|quot);/g,m=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"'}[m])).trim();
export function pickDictionaryMeaning(data){
 // Naver api3 schema has varied across Korean/English dictionaries.
 const found=[];
 const lists=data?.searchResultMap?.searchResultListMap||data?.searchResult?.searchResultListMap||{};
 const sources=[...Object.values(lists),...(data?.searchResult?.searchResultList||[])];
 for(const list of sources){
  for(const item of list?.items||[]){
   for(const v of item?.meanList||[])for(const itemMeaning of [v?.mean,v?.meaning,v?.definition,v?.value,v?.showMean,v?.showMeanBeginner])if(typeof itemMeaning==='string')found.push(itemMeaning);
   for(const col of item?.meansCollector||[])for(const v of col?.means||[])for(const value of [v?.value,v?.showMeanBeginner,v?.mean])if(typeof value==='string')found.push(value);
   if(typeof item?.expOnly==='string')try{const inner=JSON.parse(item.expOnly);for(const col of inner?.meansRevisionCollector||[])for(const v of col?.means||[])if(typeof v.showMeanBeginner==='string')found.push(v.showMeanBeginner);}catch{}
  }
 }
 return [...new Set(found.map(removeMarkup).filter(x=>x.length>2&&x.length<300&&/[가-힣]/.test(x)))].slice(0,3).join(' / ')||null;
}
export async function lookupDictionary(q,env={},fetchImpl=fetch){
 if(!/^[가-힣a-zA-Z\s]{1,24}$/.test(q))return null;
 const korean=/[가-힣]/.test(q);
 // Naver's unofficial endpoints may stop working or reject requests; no scraping of user accounts.
 const locale=korean?'koko':'enko',subdomain=korean?'ko':'en';
 const endpoint=`https://${subdomain}.dict.naver.com/api3/${locale}/search?`+new URLSearchParams({query:q,m:'pc',range:'entrySearch',entryPageSize:'3'});
 try{
  const res=await fetchImpl(endpoint,{headers:{'Accept':'application/json','Referer':`https://${subdomain}.dict.naver.com/`},signal:AbortSignal.timeout(3500)});
  if(res.ok){const meaning=pickDictionaryMeaning(await res.json());if(meaning)return {meaning,source:'naver'};}
 }catch{}
 // Optional official API key for the Korean Standard Dictionary.
 if(korean&&env.KOREAN_DICT_API_KEY){
  try{
   const url='https://stdict.korean.go.kr/api/search.do?'+new URLSearchParams({key:env.KOREAN_DICT_API_KEY,q,req_type:'json',num:'3'});
   const response=await fetchImpl(url,{signal:AbortSignal.timeout(3500)});
   if(response.ok){const d=await response.json();const items=d?.channel?.item||[];
    const means=(Array.isArray(items)?items:[items]).map(x=>x?.sense?.definition).filter(x=>typeof x==='string').slice(0,3);
    if(means.length)return {meaning:means.map(removeMarkup).join(' / '),source:'stdict'};
   }
  }catch{}
 }
 if(glosses[q])return {meaning:glosses[q],source:'context'};
 return null;
}
