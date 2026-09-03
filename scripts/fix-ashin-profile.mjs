import fs from 'node:fs';
import path from 'node:path';

const dataPath = path.resolve('public/admissions-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const profile = data.profiles.find((item) => item.u === '아신대');

if (!profile) throw new Error('아신대 프로필을 찾지 못했습니다.');

Object.assign(profile, {
  formal: '아신대학교',
  r: '경기',
  selection: '[일반전형] 나군 기독교교육과, 미디어학과, 기독교상담학과, 사회복지선교학과 학생부 60% + 면접 40% [기독학생] 나군 신학과 학생부 60% + 면접 40% [성인학습자] 나군 신학과 학생부 60% + 면접 40% [기회균형선발] 나군 전 모집단위 학생부 60% + 면접 40% [재외국민과 외국인] 나군 전 모집단위 면접 100%',
  ratio: '일반전형, 기독학생, 성인학습자, 기회균형선발은 학생부 교과 60%와 면접 40%를 반영합니다. 재외국민과 외국인은 면접 100%입니다. 수능 성적은 반영하지 않습니다.',
  metric: '학생부 국어, 영어, 사회 교과 석차등급',
  metrics: ['등급'],
  sb: true,
  sbDetail: '학생부 교과 60%',
  admission: 'https://www.acts.ac.kr/admission/design/index.asp',
  resultSource: 'https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2027&unvCd=0000145',
});

fs.writeFileSync(dataPath, JSON.stringify(data));
console.log(`corrected ${profile.u}: profile ${profile.id}`);
