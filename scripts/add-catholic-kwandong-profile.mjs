import fs from 'node:fs';
import path from 'node:path';

const dataPath = path.resolve('public/admissions-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const university = '가톨릭관동대';

data.profiles = data.profiles.filter((profile) => profile.u !== university);
const score = data.scores.find((row) => row.u === university);
const nextId = Math.max(0, ...data.profiles.map((profile) => Number(profile.id) || 0)) + 1;

data.profiles.push({
  id: nextId,
  u: university,
  formal: '가톨릭관동대학교',
  r: score?.r ?? '강원',
  selection: '[수능위주전형] 나군, 다군 수능 100%, 한국사 가점 8~10점, 의학과(의예과)는 합격 또는 불합격 면접 [실기전형] 나군, 다군 체육교육과 수능 700점+실기 300점, 스포츠레저학전공과 스포츠재활의학전공 수능 600점+실기 400점, 한국사 가점 8~10점',
  ratio: '의학과(의예과): 국어 20%, 수학 30%, 영어 20%, 탐구 30%. 간호학과: 국어 20%, 수학 30%, 영어 30%, 탐구 20%. 헬스케어융합대학과 사범대학: 국어, 수학, 영어, 탐구 중 상위 3개 영역을 1순위 40%, 2순위 30%, 3순위 30%로 반영. 트리니티융합대학: 상위 2개 영역 각 50%. 탐구는 2과목 평균. 영어 등급별 반영점수는 100, 98, 95, 92, 89, 86, 83, 80, 78점. 한국사 가산점은 1등급 10점, 2등급 9점, 3~9등급 8점.',
  metric: '국어, 수학, 탐구 백분위, 영어 등급별 환산점수, 한국사 가점',
  metrics: ['백분위', '등급'],
  sb: false,
  sbDetail: '수능위주전형 학생부 미반영',
  sourceFile: '(가톨릭관동대)2027학년도 정시모집요강_260831.pdf',
  sourcePage: 46,
  officialSourceFile: '(가톨릭관동대)2027학년도 정시모집요강_260831.pdf',
  officialSourcePages: [13, 14, 15, 17, 19, 21, 46],
  admission: 'https://ipsi.cku.ac.kr/bbs/iphak/1059/367071/artclView.do',
  resultSource: score?.source ?? 'https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2027&unvCd=0000072',
});

const cleaned = JSON.parse(JSON.stringify(data).replace(/[·ㆍ•]/g, ','));
fs.writeFileSync(dataPath, JSON.stringify(cleaned));
console.log(`connected ${university}: profile ${nextId}`);
