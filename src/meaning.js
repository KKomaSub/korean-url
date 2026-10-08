// Offline, deterministic interpretation of the *visible sentence*. No URL leaves this module.
// This is literary commentary on reversible-encoded words, not a secret message in the source URL.
const CLAUSE=/([가-힣]{2})의([가-힣]{2})[이가]([가-힣]{2})[과와]([가-힣]{2})[을를](잇고|열고|키우고|밝히고|기리고|넓히고|세우고|지키고|펴고|만들고|돌보고|가꾸고|전하고|높이고|살리고|나누고|잇다|연다|키운다|밝힌다|기린다|넓힌다|세운다|지킨다|편다|만든다|돌본다|가꾼다|전한다|높인다|살린다|나눈다)/g;
const CONCEPTS={
 한글:'모두에게 열린 문자와 소통', 세종:'배움의 기회를 넓힌 지혜', 훈민:'백성을 위한 문자 창제', 문자:'생각을 남기고 전하는 도구', 언어:'사람과 사람을 잇는 표현',
 조선:'전통과 지식이 쌓인 역사', 한국:'변화 속에서 이어온 공동체', 대한:'우리 사회의 자긍심', 독립:'자유를 지키려는 의지', 광복:'되찾은 주권과 희망',
 역사:'과거를 되새겨 미래를 여는 기억', 문화:'세대를 가로질러 나누는 삶', 유산:'다음 세대에 전할 소중한 흔적',
 과학:'관찰과 탐구로 세상을 이해하는 과정', 기술:'배움을 실생활의 변화로 잇는 힘', 산업:'사람의 노력과 협력으로 이룬 발전',
 반도:'새로운 산업을 떠받치는 첨단 기술', 전자:'현대 생활을 바꾸는 기술', 연구:'궁금증을 탐색하는 꾸준한 노력', 교육:'지식을 나누고 가능성을 키우는 일',
 미래:'오늘의 선택이 열어 갈 시간', 희망:'더 나은 내일을 향한 믿음', 성장:'새 경험 속에서 커지는 가능성', 발전:'조금씩 앞으로 나아가는 변화',
 협력:'서로 다른 강점을 보태는 힘', 평화:'서로의 삶을 존중하는 마음', 민주:'함께 결정하고 책임지는 가치', 자유:'스스로 생각하고 선택하는 권리',
 자연:'사람과 함께 살아가는 환경', 환경:'미래에 남겨야 할 생활의 터전', 한강:'일상과 역사를 품은 물길', 독도:'우리 땅과 바다의 기억',
 기록:'사라질 순간을 오래 간직하는 일', 지혜:'경험을 바르게 활용하는 힘', 사랑:'서로의 삶을 소중히 여기는 마음', 세계:'더 넓은 이웃과 교류하는 무대',
 예술:'감정과 생각을 창의적으로 나누는 방식', 전통:'시간을 넘어 이어 온 삶의 결', 문학:'말과 글로 삶을 깊이 바라보는 예술'
};
const ACTIONS={
 '잇고':'연결하고', '잇다':'이어 준다는', '열고':'새로운 가능성을 열고', '연다':'길을 연다는',
 '키우고':'한층 성장시키고', '키운다':'차근차근 키운다는',
 '밝히고':'의미를 드러내고', '밝힌다':'앞을 밝힌다는',
 '기리고':'그 가치를 기억하고', '기린다':'그 가치를 기린다는',
 '넓히고':'선택의 폭을 넓히고', '넓힌다':'가능성을 넓힌다는',
 '세우고':'새로운 바탕을 세우고', '세운다':'단단한 바탕을 세운다는',
 '지키고':'소중한 것을 지키고', '지킨다':'소중한 것을 지킨다는',
 '펴고':'생각을 널리 펼치고', '편다':'뜻을 펼친다는',
 '만들고':'새로운 가치를 만들고', '만든다':'새로운 가치를 만든다는',
 '돌보고':'주변의 가치를 돌보고', '돌본다':'함께 돌본다는',
 '가꾸고':'서서히 가꾸고', '가꾼다':'정성껏 가꾼다는',
 '전하고':'다음으로 전하고', '전한다':'후대에 전한다는',
 '높이고':'그 가치를 높이고', '높인다':'더 높은 가능성을 만든다는',
 '살리고':'그 정신을 살리고', '살린다':'그 의미를 되살린다는',
 '나누고':'더 많은 사람과 나누고', '나눈다':'함께 나눈다는'
};
function hash(text){let h=2166136261;for(const c of text){h=Math.imul(h^c.charCodeAt(0),16777619);}return h>>>0;}
function pick(values,seed){return values[seed%values.length];}
export function readMotifs(slug){
 const items=[];CLAUSE.lastIndex=0;
 for(let m;(m=CLAUSE.exec(slug))!==null;){items.push({theme:m[1],subject:m[2],bridge:m[3],object:m[4],action:m[5]});if(items.length>=50)break;}
 // v3 / shortened terminal: find actual words visible in the input.
 if(items.length===0){const words=Object.keys(CONCEPTS).filter(w=>slug.includes(w)).sort((a,b)=>slug.indexOf(a)-slug.indexOf(b));return {items,words:words.slice(0,8)};}
 return {items,words:[...new Set(items.flatMap(x=>[x.theme,x.subject,x.bridge,x.object]))]};
}
function topic(word){const cp=word.codePointAt(word.length-1)-0xac00;return word+(cp>=0&&cp<=11171&&cp%28?'은':'는');}
function subject(word){const cp=word.codePointAt(word.length-1)-0xac00;return word+(cp>=0&&cp<=11171&&cp%28?'이':'가');}
function joiner(word){const cp=word.codePointAt(word.length-1)-0xac00;return word+(cp>=0&&cp<=11171&&cp%28?'과':'와');}
function evocative(word){return CONCEPTS[word]||`‘${word}’이 주는 이미지`;}
export function fallbackMeaning(slug){
 const {items,words}=readMotifs(slug),seed=hash(slug),first=items[0],last=items.at(-1);
 if(first){
  const {theme:t,subject:s,bridge:b,object:o,action:v}=first;
  const lead=pick([
   `‘${t}’에서 출발한 문장은 ‘${s}’으로 시선을 옮깁니다. 그 사이에 ${evocative(t)}의 이미지가 흐릅니다.`,
   `‘${t}’에는 ${evocative(t)}의 느낌이 있고, ‘${s}’은 그 생각을 한 걸음 더 보내는 이미지로 등장합니다.`,
   `첫머리에 ‘${t}’${joiner(t).slice(-1)} ‘${s}’${subject(s).slice(-1)} 함께 등장합니다. ${evocative(t)}에서 새로운 장면으로 시선이 옮겨 갑니다.`
  ],seed);
  const bridge=pick([
   `이어 ‘${b}’${joiner(b).slice(-1)} ‘${o}’${subject(o).slice(-1)} 만나고, ‘${v}’라는 동작이 서로 다른 생각을 연결합니다.`,
   `‘${b}’에서 ‘${o}’으로 옮겨 가는 흐름은 ‘${v}’라는 말 덕분에 구체적인 움직임을 얻습니다.`,
   `뒤에 나오는 ‘${b}’${joiner(b).slice(-1)} ‘${o}’${topic(o).slice(-1)} 서로 다른 뜻이지만, ‘${v}’라는 서술어가 두 장면을 하나로 묶습니다.`
  ],seed>>>3);
  const ending=(last&&last!==first)
   ?pick([`끝에서는 ‘${last.theme}’에서 ‘${last.object}’으로 시선이 번져, 시작과는 다른 여운을 남깁니다.`,`마지막의 ‘${last.subject}’와 ‘${last.object}’는 앞선 이미지에 새로운 방향을 더합니다.`],seed>>>7)
   :pick([`이렇게 만들어진 흐름은 ${evocative(t)}을 통해 서로의 차이를 연결해 보는 짧은 상상입니다.`,`익숙하지 않은 낱말의 조합이지만, ‘${t}’이라는 주제를 중심으로 연결과 변화의 의미를 읽을 수 있습니다.`],seed>>>7);
  return [lead,bridge,ending].join(' ');
 }
 if(words.length){const [a,b,c]=words;return pick([
  `‘${a}’에는 ${evocative(a)}이 담겨 있습니다. ${b?`뒤이어 ‘${b}’이 등장해 ${evocative(b)}과 이어지고, `:''}${c?`‘${c}’의 이미지까지 더해져 `:''}한 문장 안에서 서로 다른 가치를 잇는 풍경이 됩니다.`,
  `이 문장에는 ‘${a}’의 이미지가 뚜렷합니다. ${evocative(a)}을 떠올리게 합니다. ${b?`또 ‘${b}’에는 ${evocative(b)}이 담겨 있어, 두 표현이 서로의 의미를 넓혀 줍니다.`:'낱말 자체가 문장을 움직이는 중심이 됩니다.'}`
 ],seed);}
 return '각 낱말의 이미지가 연결되어 하나의 글길을 이룹니다. 뜻이 궁금한 부분을 선택하면 개별 낱말의 설명도 확인할 수 있습니다.';
}

export const glosses=CONCEPTS;
