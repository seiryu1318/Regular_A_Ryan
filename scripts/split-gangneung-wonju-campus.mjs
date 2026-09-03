import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dataPath = join(scriptDir, '..', 'public', 'admissions-data.json');

// 강원대학교 2027학년도 강릉·원주캠퍼스 정시모집요강의 모집단위 표와
// 강원대학교가 공개한 2024~2026학년도 입시결과의 캠퍼스 구분을 함께 대조했다.
const wonjuDepartments = new Set([
  '간호학과',
  '기계공학과',
  '다문화학과',
  '멀티미디어공학과',
  '사회복지학과',
  '산업경영공학과',
  '유아교육과',
  '자동차공학과',
  '전기공학과',
  '정보통신공학과',
  '컴퓨터공학과',
]);

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
let profileCount = 0;
let gangneungRows = 0;
let wonjuRows = 0;

for (const profile of data.profiles) {
  if (profile.u !== '강릉원주대' && profile.u !== '강원대(강릉원주대)') continue;
  profile.u = '강원대(강릉원주대)';
  profile.formal = '강원대학교(강릉원주)';
  profile.selection = '강릉 나군 2명, 다군 64명 / 원주 다군 25명, 수능 100';
  profileCount += 1;
}

for (const row of data.scores) {
  if (!['국립강릉원주대', '강원대(강릉)', '강원대(원주)'].includes(row.u)) continue;
  if (wonjuDepartments.has(row.d)) {
    row.u = '강원대(원주)';
    wonjuRows += 1;
  } else {
    row.u = '강원대(강릉)';
    gangneungRows += 1;
  }
}

if (profileCount !== 1) throw new Error(`통합 반영방법 레코드 수 오류: ${profileCount}`);
if (gangneungRows + wonjuRows !== 120) {
  throw new Error(`입시결과 레코드 수 오류: ${gangneungRows + wonjuRows}`);
}

const oldNames = data.scores.filter((row) => row.u === '국립강릉원주대').length;
if (oldNames !== 0) throw new Error(`변경되지 않은 대학명: ${oldNames}`);

writeFileSync(dataPath, JSON.stringify(data), 'utf8');
console.log(JSON.stringify({ profileCount, gangneungRows, wonjuRows }, null, 2));
