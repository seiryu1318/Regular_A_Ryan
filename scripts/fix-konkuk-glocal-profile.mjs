import { readFile, writeFile } from 'node:fs/promises';

const dataPath = new URL('../public/admissions-data.json', import.meta.url);
const data = JSON.parse(await readFile(dataPath, 'utf8'));
const profile = data.profiles.find((row) => row.id === 100 && row.u === '건국대(글)');

if (!profile) throw new Error('건국대(글) 프로필을 찾지 못했습니다.');

profile.selection = '다군 수능 중심 전형';
await writeFile(dataPath, JSON.stringify(data), 'utf8');
