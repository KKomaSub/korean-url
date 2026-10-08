import {nounsV3, themesV3} from './words-v3.js';

// Eight curated Korean-history / Korean-achievement concept families. A term can
// belong to several families: this is an overlapping concept graph, not a partition.
const FAMILIES = [
 ['한글','세종','문자','언어','음절','자음','모음','문장','문학','서예','훈민','창제','글씨','국문','고전','학문','교육','학교','서당','기록','문헌','시인','시집','종이','연필','서원','향교','선비','출판','인쇄','지식','지혜','세계','미래','문화','예술','역사','정성','기억','사랑','희망'],
 ['조선','세종','고궁','궁궐','궁전','왕조','왕궁','왕실','한양','서울','경주','신라','고려','백제','가야','유산','유적','고분','석탑','성곽','성문','독립','광복','해방','주권','민족','국왕','위인','영웅','학문','과학','국토','문화','기록','후손','역사','미래','전통','민주','평화','자유','존중','지혜'],
 ['과학','기술','연구','발명','발견','창조','창의','실험','천문','우주','로켓','위성','탐사','관측','측정','공학','물리','화학','생물','수학','의학','의료','백신','항공','기계','전자','전기','전력','반도','정보','통신','기술','학문','발전','미래','세계','산업','인재','도전','성장','성과','교육'],
 ['산업','공업','제조','생산','공장','경제','기업','수출','무역','시장','금융','교통','철도','도로','교량','항구','선박','해양','농업','농사','농촌','농부','농장','수확','풍년','종자','산림','공학','과학','기술','반도','전자','기계','전력','도시','건설','건축','발전','성장','도약','번영','세계','미래','협력','혁신'],
 ['독립','광복','주권','평화','자유','민주','국민','민족','정부','국회','법률','헌법','정의','공정','인권','시민','개혁','혁신','협력','상생','존중','배려','약속','신뢰','화합','협동','단결','연결','소통','교류','우애','공감','감사','가족','가정','사회','정책','공공','희망','행복','미래','문화'],
 ['한강','금강','백두','독도','울릉','제주','동해','서해','남해','바다','해양','국토','자연','환경','생태','기후','지구','태양','은하','하늘','구름','나무','호수','계곡','산림','강산','산천','수확','풍년','농촌','농업','여정','지도','등대','새벽','아침','노을','파도','산길','평화','생명','미래','세계'],
 ['한복','한옥','한지','한식','풍속','풍류','예술','미술','음악','국악','민요','가곡','산조','장단','장구','무용','연극','영화','공연','전시','공예','도자','청자','백자','문학','문장','글씨','서예','문화','전통','유산','역사','축제','잔치','교육','소통','여행','기쁨','사랑','조화','아름','감성','희망'],
 ['미래','내일','오늘','발전','진보','성장','도약','번영','영광','희망','소망','열정','노력','정성','결실','기쁨','행복','사랑','존중','배려','협력','상생','동행','우정','약속','신뢰','지혜','지식','교양','품격','보람','가치','사명','화합','단결','연결','감사','창의','도전','승리','성과','업적','인재','세계','기술','문화']
];
const ROOT_HINTS = [
 '한글 세종 문자 언어 음절 자음 모음 문장 문학 서예 훈민 창제 글씨 국문 고전 학문 교육 학교 서당 기록 문헌',
 '조선 역사 고궁 궁궐 궁전 왕조 왕궁 왕실 한양 서울 경주 신라 고려 백제 가야 유산 유적 독립 광복 해방',
 '과학 기술 연구 발명 발견 창조 창의 실험 천문 우주 로켓 위성 탐사 관측 측정 공학 물리 화학 생물 수학',
 '산업 공업 제조 생산 공장 경제 기업 수출 무역 시장 금융 교통 철도 도로 교량 항구 선박 해양 농업 농촌',
 '독립 광복 주권 평화 자유 민주 국민 민족 정부 국회 법률 헌법 정의 공정 인권 시민 개혁 혁신 협력 상생',
 '한강 금강 백두 독도 바다 해양 국토 자연 환경 생태 기후 지구 태양 은하 하늘 구름 나무 호수 계곡',
 '한복 한옥 한지 한식 풍속 풍류 예술 미술 음악 국악 민요 가곡 산조 장단 장구 무용 연극 영화 공예',
 '미래 내일 오늘 발전 진보 성장 도약 번영 영광 희망 소망 열정 노력 정성 결실 기쁨 행복 사랑 존중 배려'
].map(x=>new Set(x.split(' ')));
const RELATED = [
 [9,7,4,2,5,1,8,7], [7,9,4,2,7,5,8,7], [5,5,9,8,3,4,4,8],
 [2,3,8,9,4,6,4,8], [5,7,3,4,9,5,6,8], [2,5,4,6,5,9,6,7],
 [8,8,4,4,7,6,9,7], [7,7,8,8,8,7,7,9]
];
const masks = nounsV3.map(w=>FAMILIES.reduce((bits,f,i)=>bits|(f.includes(w)?1<<i:0),0));
const rootMasks = nounsV3.map(w=>ROOT_HINTS.reduce((bits,f,i)=>bits|(f.has(w)?1<<i:0),0)||1<<7);
const N=512, BRANCH=256;
if(nounsV3.length!==N||themesV3.length!==256||new Set(nounsV3).size!==N)throw Error('고정 사전 형식 오류');
const cache=new Map();
const rootCache=new Map();
export function rootChoices(previous=0){
 if(rootCache.has(previous))return rootCache.get(previous);
 const anchor=previous?masks[previous%N]:0;
 const rank=Array.from({length:335},(_,i)=>({
  i,
  score:(i<275?18:0)+(masks[i]?22:0)+similarity(anchor,masks[i])*2+
  (['한글','세종','조선','한국','대한','나라','문화','역사','과학','기술','산업','교육','미래','희망','독립','광복','평화','자유','세계','전통','예술','연구','민주','기록','우주','국민','사랑'].includes(nounsV3[i])?30:0),
  tie:seedHash(i,previous,13)
 }));
 rank.sort((a,b)=>b.score-a.score||a.tie-b.tie||a.i-b.i);
 const roots=rank.slice(0,256).map(x=>x.i);
 if(rootCache.size>=128)rootCache.clear();rootCache.set(previous,roots);
 return roots;
}
function similarity(a,b){let score=0;for(let i=0;i<8;i++)if(a&(1<<i))for(let j=0;j<8;j++)if(b&(1<<j))score+=RELATED[i][j];return score;}
function seedHash(a,b,c){let x=(a*2246822519^b*3266489917^c*668265263)>>>0;x=Math.imul(x^(x>>>16),2246822519);return (x^(x>>>13))>>>0;}
// stage=0 character/source; stage=1 object modifier; stage=2 object head.
// Every edge is a ranked contextual neighbour in an overlapping semantic graph;
// the rank (not a raw word index) is the actual reversible payload.
export function choices(theme,stage,prior=[],previous=0){
 const key=[theme,stage,...prior,previous].join(':');
 if(cache.has(key))return cache.get(key);
 const focus=rootMasks[rootChoices(previous)[theme]];
 const recent=prior.length?masks[prior[prior.length-1]]:0;
 const earlier=prior.length>1?masks[prior[prior.length-2]]:0;
 const prev=previous?masks[previous%N]:0;
 const candidates=Array.from({length:335},(_,i)=>i).filter(i=>!prior.includes(i));
 const scored=candidates.map(i=>{
   const m=masks[i],w=nounsV3[i];
   let score=similarity(focus,m)*4+similarity(recent,m)*3+similarity(earlier,m)+similarity(prev,m)+(i<330?20:0)+(m?15:0);
   // General concepts provide grammatical glue between ancient history and technology.
   if(['문화','미래','세계','기술','교육','역사','지혜','가치','한글','산업','희망','과학','연구','발전','전통','성장','기록','사랑','사람','경제','기억'].includes(w))score+=30;
   if(stage===0&&['지혜','기술','문화','역사','희망','정신','연구','산업','발전','노력','교육','가치'].includes(w))score+=18;
   if(stage===2&&['문화','산업','기술','시장','미래','역사','가치','경제','과학','정신','세계','교육','연구','발전','유산','예술'].includes(w))score+=22;
   return {i,score,tie:seedHash(i,theme,stage)};
 });
 scored.sort((a,b)=>b.score-a.score||a.tie-b.tie||a.i-b.i);
 const selected=scored.slice(0,BRANCH).map(x=>x.i);
 if(cache.size>=128)cache.clear();cache.set(key,selected);
 return selected;
}
export function locate(choices,index){return choices.indexOf(index);}
export function themeWord(id,previous=0){return nounsV3[rootChoices(previous)[id]];}
export function nounWord(id){return nounsV3[id];}
export function themeId(word,previous=0){return rootChoices(previous).indexOf(nounsV3.indexOf(word));}
export function nounId(word){return nounsV3.indexOf(word);}
export const THEMES_ORDER=[]; // all v4 roots are exactly two Hangul syllables