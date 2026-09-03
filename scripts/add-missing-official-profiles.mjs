import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataPath = path.join(projectRoot, 'public', 'admissions-data.json');
const sourceRoot = 'C:\\Users\\User\\Desktop\\업무\\작업\\21. 정시모집 관련\\00. 소스(모집요강)';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const official = [
  {
    u: '가야대', formal: '가야대학교', r: '경남',
    selection: '다군 일반전형 수능 70% + 학생부 30%',
    ratio: '국어·수학·영어 중 상위 2개 영역 80%, 탐구 상위 1과목 10%, 한국사 10%',
    metric: '국어·수학·탐구 백분위, 영어·한국사 등급 환산', metrics: ['백분위', '등급'],
    sb: true, sbDetail: '학생부 교과 30%',
    sourceFile: '대입정보포털 2027학년도 전형평가기준', sourcePage: 1,
    officialSourceFile: '대입정보포털 2027학년도 전형평가기준',
    admission: 'https://ipsi.kaya.ac.kr/Home/Main.mbz',
  },
  {
    u: '극동대', formal: '극동대학교', r: '충북',
    selection: '나군 일반학생 수능 100%, 일부 학과 수능 60% + 면접 40% / 다군 일반학생 수능 20% + 실기 80%',
    ratio: '국어·수학·영어 중 상위 2개 영역 각 35%, 탐구 상위 1과목 30%, 한국사 응시 필수·점수 미반영',
    metric: '국어·수학·탐구 백분위, 영어 등급 환산', metrics: ['백분위', '등급'],
    sb: false, sbDetail: '미반영',
    sourceFile: '2027_극동대_정시요강.pdf', sourcePage: 30,
    officialSourceFile: '2027_극동대_정시요강.pdf',
    officialSourcePath: `${sourceRoot}\\충청호남\\4. 충청권\\2027_극동대_정시요강.pdf`,
    officialSourcePages: [30, 31], admission: 'https://www.kdu.ac.kr/ipsi/main.do',
  },
  {
    u: '목포가톨릭대', formal: '목포가톨릭대학교', r: '전남',
    selection: '가군 일반학생 간호학과 수능 100% / 사회복지학과 수능 60% + 학생부 40%',
    ratio: '국어 또는 수학 중 상위 1개 영역 40%, 영어 40%, 탐구 상위 1과목 20%, 한국사 가산점',
    metric: '국어·수학·탐구 백분위, 영어 등급 환산, 한국사 가점', metrics: ['백분위', '등급'],
    sb: true, sbDetail: '사회복지학과 학생부 40%',
    sourceFile: '2027_목포가톨릭대_정시요강.pdf', sourcePage: 29,
    officialSourceFile: '2027_목포가톨릭대_정시요강.pdf',
    officialSourcePath: `${sourceRoot}\\충청호남\\5. 호남권\\2027_목포가톨릭대_정시요강.pdf`,
    officialSourcePages: [29, 30], admission: 'https://www.mcu.ac.kr/ipsi/',
  },
  {
    u: '서울기독대', formal: '서울기독대학교', r: '서울',
    selection: '나군 일반전형 수능 60% + 학생부 40%',
    ratio: '국어 40%, 영어 30%, 탐구 30%, 한국사 미반영',
    metric: '영역별 등급 환산', metrics: ['등급'],
    sb: true, sbDetail: '학생부 40%',
    sourceFile: '2027_서울기독대_정시요강.pdf', sourcePage: 10,
    officialSourceFile: '2027_서울기독대_정시요강.pdf',
    officialSourcePath: `${sourceRoot}\\서울\\2027_서울기독대_정시요강.pdf`,
    officialSourcePages: [5, 10], admission: 'https://admission.scu.ac.kr/entrance',
  },
  {
    u: '서울장신대', formal: '서울장신대학교', r: '경기',
    selection: '다군 정시 모집인원 없음, 수시 미충원 발생 시 별도 공지',
    ratio: '2027학년도 정시 미선발 예정',
    metric: '정시 선발 시 입학처 공지 적용', metrics: [],
    sb: null, sbDetail: '정시 선발 시 공지',
    sourceFile: '2027_서울장신대_모집요강.pdf', sourcePage: 17,
    officialSourceFile: '2027_서울장신대_모집요강.pdf',
    officialSourcePath: `${sourceRoot}\\경기인천강원\\2. 경기인천\\2027_서울장신대_모집요강.pdf`,
    officialSourcePages: [17, 19], admission: 'https://www.sjs.ac.kr/admission/main/',
  },
  {
    u: '장로회신학대', formal: '장로회신학대학교', r: '서울',
    selection: '나군 일반전형 자유전공·신학과·기독교교육과 수능 100% / 교회음악학과 수능 20% + 실기 80%',
    ratio: '자유전공·신학과·기독교교육과 국어·수학·영어·탐구 중 상위 3개 영역 각 33.3% / 교회음악학과 국어 50%, 영어 50%',
    metric: '국어·수학·탐구 백분위, 영어 등급 환산', metrics: ['백분위', '등급'],
    sb: false, sbDetail: '미반영',
    sourceFile: '2027_장로회신대_정시요강.pdf', sourcePage: 14,
    officialSourceFile: '2027_장로회신대_정시요강.pdf',
    officialSourcePath: `${sourceRoot}\\서울\\2027_장로회신대_정시요강.pdf`,
    officialSourcePages: [4, 14], admission: 'https://ipsi.puts.ac.kr/',
  },
  {
    u: '중원대', formal: '중원대학교', r: '충북',
    selection: '가군 수능위주 일반전형 1 수능 100%',
    ratio: '국어·수학·영어·탐구 중 상위 3개 영역 각 33.3%, 한국사 응시 필수·가산점 없음',
    metric: '국어·수학·탐구 백분위, 영어 등급 환산', metrics: ['백분위', '등급'],
    sb: false, sbDetail: '미반영',
    sourceFile: '대입정보포털 2027학년도 전형평가기준', sourcePage: 1,
    officialSourceFile: '대입정보포털 2027학년도 전형평가기준',
    admission: 'https://ipsi.jwu.ac.kr/intro',
  },
];

let nextId = Math.max(...data.profiles.map((profile) => profile.id)) + 1;
for (const profile of official) {
  const previous = data.profiles.find((item) => item.u === profile.u);
  const resultRow = data.scores.find((row) => row.u === profile.u);
  const full = {
    id: previous?.id ?? nextId++,
    ...profile,
    resultSource: resultRow?.source ?? null,
  };
  if (previous) Object.assign(previous, full);
  else data.profiles.push(full);
}

for (const row of data.scores) {
  if (row.u === '가야대') row.r = '경남';
}

fs.writeFileSync(dataPath, JSON.stringify(data), 'utf8');
console.log(`profiles=${data.profiles.length} added_or_updated=${official.length}`);
