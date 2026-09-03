'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Download,
  ExternalLink,
  Landmark,
  Languages,
  House,
  Monitor,
  Moon,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ryanLogo from '@/public/ryan.jpg';

import { RELEASE_VERSION } from './release';

const PC_SITE_URL = 'https://seiryu1318.github.io/Regular_A_Ryan/';
const MOBILE_SITE_URL = 'https://seiryu1318.github.io/Regular_A_RyanM/';
const ADMISSION_PORTAL_URL = 'https://seiryu1318.github.io/admission_Ryan/';

type SortDirection = 'asc' | 'desc';
type SortState = { key: string; direction: SortDirection };
type ThemeMode = 'light' | 'dark';
type TrackCategory = '인문' | '자연' | '예체능' | '의약학';

const TRACK_CATEGORIES: TrackCategory[] = ['인문', '자연', '예체능', '의약학'];

type Overview = {
  totalRegular: number;
  change: number;
  capital: number;
  capitalChange: number;
  nonCapital: number;
  nonCapitalChange: number;
  examFocused: number;
  examFocusedRate: number;
  groups: Record<'가' | '나' | '다', number>;
  schedule: { label: string; value: string }[];
};

type ChangeRow = {
  id: number;
  u: string;
  category: string;
  current: string;
  previous: string;
  sourceFile: string;
};

type Profile = {
  id: number;
  u: string;
  formal: string;
  r: string;
  selection: string;
  ratio: string;
  metric: string;
  metrics: string[];
  sb: boolean | null;
  sbDetail: string;
  sourceFile: string;
  sourcePage: number;
  officialSourceFile?: string;
  officialSourcePath?: string;
  officialSourcePages?: number[];
  historyMethod?: string;
  admission: string | null;
  resultSource: string | null;
};

type ScoreRow = {
  id: number;
  u: string;
  y: number;
  a: string;
  g: string;
  d: string;
  t: string;
  n: number | null;
  c: number | null;
  x: number | null;
  add: number | null;
  cv50: number | null;
  cv70: number | null;
  max: number | null;
  p50: number | null;
  p70: number | null;
  ko: number | null;
  ma: number | null;
  inq: number | null;
  en: number | null;
  r: string;
  source: string | null;
  admission: string | null;
  metric: string;
  sb: boolean | null;
  exam?: string;
  missingReason?: string | null;
};
type CutMetric = '백분위' | '성적';
type ScoreView = ScoreRow & {
  ruleMatches: MethodView[];
  displayGroup: string;
  cutMetric: CutMetric;
};

type StudentRecordRow = { u: string; method: string; type: string };
type SourceRow = { name: string; organization: string; url?: string; local?: boolean };
type AdmissionsData = {
  overview: Overview;
  changes: ChangeRow[];
  profiles: Profile[];
  studentRecord: StudentRecordRow[];
  scores: ScoreRow[];
  sources: SourceRow[];
};

type RatioSnapshot = {
  korean: number | null;
  math: number | null;
  english: number | null;
  inquiry: number | null;
  history: string;
};

type WeightSnapshot = Pick<RatioSnapshot, 'korean' | 'math' | 'english' | 'inquiry'>;
type ProfileView = Profile & { ratios: RatioSnapshot; weights: WeightSnapshot; domainCount: number; conversionMax: number | null };
type ResultRange = { label: string; sortValue: number | null };
type MethodResultSummary = { percentile: ResultRange; converted: ResultRange; maximum: ResultRange };
type DomainKey = keyof WeightSnapshot;
type RatioLabels = Partial<Record<DomainKey, string>>;
type MethodView = ProfileView & {
  rowId: string;
  admissionGroup: string;
  examName: string;
  trackName: string;
  englishMethod: string;
  selectionDetail: string;
  bonusDetail: string;
  ratioLabels?: RatioLabels;
  weightLabels?: RatioLabels;
  result2026?: MethodResultSummary;
  result2026Rows?: ScoreRow[];
  departmentName?: string;
  departmentTrack?: TrackCategory;
};
type FormulaRow = {
  formulaId: number;
  trackName: string;
  groupHint: string | null;
  ratios: RatioSnapshot;
  weights: WeightSnapshot;
  domainCount: number;
  englishMethod: string;
  bonusDetail?: string;
  examHint?: string;
  examNameOverride?: string;
  metricsOverride?: string[];
  ratioLabels?: RatioLabels;
  weightLabels?: RatioLabels;
  sbOverride?: boolean;
  sbDetailOverride?: string;
};

declare global {
  interface Window {
    __ADMISSIONS_DATA__?: AdmissionsData;
    modelContext?: {
      registerTool?: (tool: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }) => void;
    };
  }
}

const MAJOR_SEOUL_UNIVERSITIES = new Set([
  '서울대',
  '연세대',
  '고려대',
  '서강대',
  '성균관대',
  '한양대',
  '중앙대',
  '경희대',
  '한국외대',
  '한국외국어대',
  '서울시립대',
  '건국대',
  '동국대',
  '홍익대',
  '숙명여대',
  '이화여대',
]);
const REGULAR_CHANGE_IDS = new Set([
  2, 3, 6, 7, 10, 13, 17, 18, 19, 20, 21, 22, 23, 25, 28, 32,
  42, 45, 46, 47, 54, 55, 66, 68, 72, 75, 78, 80,
]);
const REGULAR_CHANGE_REWRITES: Record<number, Partial<ChangeRow>> = {
  2: { previous: '이월 인원만 선발' },
  6: { category: '모집단위', current: '환경조경디자인학과: 정시모집 미선발' },
  19: { current: '수능우수전형 Ⅱ 신설: 수능 90 + 학생부 10' },
  22: { current: '의료인공지능공학과: 수능일반 14명 선발' },
  23: { current: '지능형네트워크융합학과: 수능일반 8명 선발' },
  25: { current: '경영대학: 수능일반 99명 선발' },
  68: { current: '무전공학부(진리자유학부) 신설: 정시 147명 선발', previous: '정시 선발인원 미공개' },
  72: { current: '생명시스템대학 생명과학부 광역모집: 정시 일반전형 14명 선발', previous: '생명과학부: 정시 일반전형 선발' },
};
const SCORE_PROFILE_ALIASES: Record<string, string> = {
  '국립강릉원주대': '강원대(강릉원주대)',
  '강원대(강릉)': '강원대(강릉원주대)',
  '강원대(원주)': '강원대(강릉원주대)',
  '국립공주대': '공주대',
  '국립한국교통대': '한국교통대',
  '단국대(죽전)': '단국대',
  '상명대(서울)': '상명대',
  '전남대(여수)': '전남대',
  '차의과대': '차의과학대',
  '한국외대': '한국외국어대',
  '한국외대(글)': '한국외국어대',
};
const SPECIAL_ADMISSION_PATTERN = /특성화|농어촌|지역(?:인재|균형|기회|메디|전형)|강원인재|기회균형|기회균등|저소득|차상위|수급|사회(?:적)?배려|특수교육|장애인|성인학습|재직자|군위탁|정원외|서해5도|고른기회|계약학과|기독교전형|군사학과전형|국방.*전형|사이버국방|항공시스템공학.*특별|자율전공\s*특별/;
const PROFILE_SORTERS: Record<string, (row: MethodView) => string | number | boolean | null | undefined> = {
  r: (row) => displayRegion(row.r, row.u),
  u: (row) => row.u,
  admissionGroup: (row) => row.admissionGroup,
  examName: (row) => row.examName,
  trackCategory: (row) => methodTrackCategories(row).join(', '),
  trackName: (row) => row.trackName,
  departmentName: (row) => row.departmentName ?? row.trackName,
  englishMethod: (row) => row.englishMethod,
  percentageMetric: (row) => row.metrics.includes('백분위') ? 1 : 0,
  gradeMetric: (row) => row.metrics.includes('등급') ? 1 : 0,
  standardMetric: (row) => row.metrics.includes('표준점수') ? 1 : 0,
  convertedMetric: (row) => row.metrics.includes('변환표준점수') ? 1 : 0,
  domainCount: (row) => row.domainCount,
  korean: (row) => row.ratios.korean,
  math: (row) => row.ratios.math,
  english: (row) => row.ratios.english,
  inquiry: (row) => row.ratios.inquiry,
  koreanWeight: (row) => row.weights.korean,
  mathWeight: (row) => row.weights.math,
  englishWeight: (row) => row.weights.english,
  inquiryWeight: (row) => row.weights.inquiry,
  topDomain: (row) => highestRatioDomains(row.ratios),
  baseline: (row) => row.domainCount ? 100 / row.domainCount : null,
  history: (row) => row.ratios.history,
  conversionMax: (row) => row.conversionMax,
  percentile2026: (row) => row.result2026?.percentile.sortValue,
  converted2026: (row) => row.result2026?.converted.sortValue,
  maximum2026: (row) => row.result2026?.maximum.sortValue,
  sb: (row) => recordLabel(row),
  selection: (row) => row.selectionDetail,
};

export default function Home() {
  const mobileBuild = typeof window !== 'undefined'
    && (window as Window & { __MOBILE_VERSION__?: boolean }).__MOBILE_VERSION__ === true;
  const [data, setData] = useState<AdmissionsData | null>(() => typeof window === 'undefined' ? null : window.__ADMISSIONS_DATA__ ?? null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('changes');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      return window.localStorage.getItem('admissions-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [changeQuery, setChangeQuery] = useState('');
  const [changeUniversity, setChangeUniversity] = useState('전체');
  const [changeCategory, setChangeCategory] = useState('전체');
  const [changeSort, setChangeSort] = useState<SortState>({ key: 'u', direction: 'asc' });

  const [profileQuery, setProfileQuery] = useState('');
  const [profileRegion, setProfileRegion] = useState('전체');
  const [profileUniversity, setProfileUniversity] = useState('전체');
  const [profileGroup, setProfileGroup] = useState('전체');
  const [profileExam, setProfileExam] = useState('전체');
  const [profileTrack, setProfileTrack] = useState('전체');
  const [profileEnglish, setProfileEnglish] = useState('전체');
  const [profileMetric, setProfileMetric] = useState('전체');
  const [profileRecord, setProfileRecord] = useState('전체');
  const [profileDomainCount, setProfileDomainCount] = useState('전체');
  const [profileTopDomain, setProfileTopDomain] = useState('전체');
  const [profileMaximum, setProfileMaximum] = useState('전체');
  const [profileSort, setProfileSort] = useState<SortState>({ key: 'u', direction: 'asc' });
  const [showPractical, setShowPractical] = useState(false);
  const [departmentColumnWidth, setDepartmentColumnWidth] = useState(250);
  const [changeListBatch, setChangeListBatch] = useState(1);
  const [recordListBatch, setRecordListBatch] = useState(1);
  const [profileListBatch, setProfileListBatch] = useState(1);
  const [selectedProfile, setSelectedProfile] = useState<MethodView | null>(null);
  const [expandedMethodRows, setExpandedMethodRows] = useState<Set<string>>(() => new Set());

  const [scoreQuery, setScoreQuery] = useState('');
  const [scoreRegion, setScoreRegion] = useState('전체');
  const [scoreUniversity, setScoreUniversity] = useState('전체');
  const [scoreYear, setScoreYear] = useState('전체');
  const [scoreTrack, setScoreTrack] = useState('전체');
  const [scoreGroups, setScoreGroups] = useState<string[]>([]);
  const [scorePercentileMin, setScorePercentileMin] = useState('');
  const [scorePercentileMax, setScorePercentileMax] = useState('');
  const [scoreConvertedMin, setScoreConvertedMin] = useState('');
  const [scoreConvertedMax, setScoreConvertedMax] = useState('');
  const [scoreSort, setScoreSort] = useState<SortState>({ key: 'y', direction: 'desc' });
  const [scoreListBatch, setScoreListBatch] = useState(1);
  const [scheduleListBatch, setScheduleListBatch] = useState(1);
  const [selectedScore, setSelectedScore] = useState<ScoreView | null>(null);
  const [expandedScoreRows, setExpandedScoreRows] = useState<Set<number>>(() => new Set());

  const toggleMethodDetails = (rowId: string) => {
    setExpandedMethodRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleScoreDetails = (rowId: number) => {
    setExpandedScoreRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    document.documentElement.dataset.theme = themeMode;
    try {
      window.localStorage.setItem('admissions-theme', themeMode);
    } catch {
      // file:// 환경에서 저장소 사용이 막혀도 현재 화면의 테마는 유지한다.
    }
  }, [themeMode]);

  useEffect(() => {
    if (data) return;
    let alive = true;
    fetch('./admissions-data.json')
      .then((response): Promise<AdmissionsData> => {
        if (!response.ok) throw new Error('파일을 불러오지 못했습니다.');
        return response.json() as Promise<AdmissionsData>;
      })
      .then((payload: AdmissionsData) => {
        if (alive) setData(payload);
      })
      .catch(() => {
        if (alive) setError('파일을 불러오지 못했습니다. 페이지를 새로 고침해 주세요.');
      });
    return () => {
      alive = false;
    };
  }, [data]);

  useEffect(() => {
    const registerTool = window.modelContext?.registerTool;
    if (!registerTool) return;
    registerTool({
      name: 'filter_regular_admission_results',
      description: '대학, 지역, 연도, 모집단위 조건으로 정시 입시결과를 찾습니다.',
      inputSchema: {
        type: 'object',
        properties: {
          university: { type: 'string' },
          region: { type: 'string' },
          year: { type: 'number' },
          department: { type: 'string' },
        },
      },
      execute: async (input) => {
        setTab('results');
        if (typeof input.university === 'string') setScoreUniversity(input.university);
        if (typeof input.region === 'string') setScoreRegion(input.region);
        if (typeof input.year === 'number') setScoreYear(String(input.year));
        if (typeof input.department === 'string') setScoreQuery(input.department);
        setScoreListBatch(1);
        return { content: [{ type: 'text', text: '조건을 적용했습니다.' }] };
      },
    });
  }, []);

  const regularScores = useMemo(() => (data?.scores ?? []).filter(isGeneralScoreRow), [data]);
  const profileViews = useMemo<ProfileView[]>(() => {
    const maximums = representativeMaximums(regularScores);
    return (data?.profiles ?? []).map((profile) => {
      const regularProfile = {
        ...profile,
        selection: profile.selection.replace(/수시\s*이월\s*인원/g, '이월인원'),
      };
      const ratios = extractRatios(regularProfile);
      return {
        ...regularProfile,
        ratios,
        weights: practicalWeights(ratios),
        domainCount: reflectedDomainCount(ratios),
        conversionMax: maximums.get(profile.u) ?? null,
      };
    });
  }, [data, regularScores]);
  const methodViews = useMemo<MethodView[]>(() => {
    const methods = mergeEquivalentAdmissionGroups(profileViews.flatMap(expandProfileMethods)).filter(isGeneralMethodRow);
    return attach2026ResultSummaries(methods, regularScores);
  }, [profileViews, regularScores]);
  const methodDisplayViews = useMemo<MethodView[]>(() => splitMethodsByDepartment(methodViews, regularScores), [methodViews, regularScores]);
  const scoreViews = useMemo<ScoreView[]>(() => {
    const methodsByUniversity = new Map<string, MethodView[]>();
    methodViews.forEach((method) => {
      const list = methodsByUniversity.get(method.u) ?? [];
      list.push(method);
      methodsByUniversity.set(method.u, list);
    });
    const historicalGroups = historicalAdmissionGroups(regularScores);
    return regularScores.map((score) => {
      const ruleMatches = scoreMethodsForRow(
        score,
        methodsByUniversity.get(score.u)
          ?? methodsByUniversity.get(SCORE_PROFILE_ALIASES[score.u] ?? '')
          ?? [],
      );
      const fallbackGroup = historicalGroups.get(scoreGroupKey(score)) ?? (score.g ? `${score.g.replace(/군$/, '')}군` : '군외');
      return {
        ...score,
        t: scoreTrackCategory(score),
        ruleMatches,
        displayGroup: fallbackGroup,
        cutMetric: scoreCutMetric(score),
      };
    });
  }, [methodViews, regularScores]);
  const regularChanges = useMemo(() => regularAdmissionChanges(data?.changes ?? []), [data]);

  const changeUniversities = useMemo(() => unique(regularChanges.map((row) => row.u)), [regularChanges]);
  const changeCategories = useMemo(() => unique(regularChanges.map((row) => row.category)), [regularChanges]);
  const profileRegions = useMemo(() => regionOptions(methodDisplayViews.map((row) => displayRegion(row.r, row.u))), [methodDisplayViews]);
  const profileUniversities = useMemo(() => unique(methodDisplayViews.map((row) => row.u)), [methodDisplayViews]);
  const profileGroups = useMemo(() => {
    const available = new Set(methodDisplayViews.flatMap((row) => atomicAdmissionGroups(row.admissionGroup)));
    return ['가군', '나군', '다군', '군외'].filter((group) => available.has(group));
  }, [methodDisplayViews]);
  const profileExams = useMemo(() => unique(methodDisplayViews.map((row) => row.examName)), [methodDisplayViews]);
  const profileTracks = useMemo(() => TRACK_CATEGORIES.filter((track) => methodDisplayViews.some((row) => methodTrackCategories(row).includes(track))), [methodDisplayViews]);
  const profileEnglishMethods = useMemo(() => unique(methodDisplayViews.map((row) => row.englishMethod)), [methodDisplayViews]);
  const profileDomainCounts = useMemo(() => unique(methodDisplayViews.map((row) => row.domainCount ? String(row.domainCount) : '')), [methodDisplayViews]);
  const scoreRegions = useMemo(() => regionOptions(regularScores.map((row) => displayRegion(row.r, row.u))), [regularScores]);
  const scoreUniversities = useMemo(() => unique(regularScores.map((row) => row.u)), [regularScores]);
  const scoreTracks = useMemo(() => {
    const available = new Set(scoreViews.map((row) => row.t).filter(Boolean));
    return TRACK_CATEGORIES.filter((track) => available.has(track));
  }, [scoreViews]);

  const changeRows = useMemo(() => {
    const query = normalize(changeQuery);
    const filtered = regularChanges.filter((row) => {
      const matchesQuery = !query || normalize(`${row.u} ${row.category} ${row.current} ${row.previous}`).includes(query);
      return matchesQuery
        && (changeUniversity === '전체' || row.u === changeUniversity)
        && (changeCategory === '전체' || row.category === changeCategory);
    });
    return sortRows(filtered, changeSort, {
      u: (row) => row.u,
      category: (row) => row.category,
      previous: (row) => row.previous,
      current: (row) => row.current,
    });
  }, [changeCategory, changeQuery, changeSort, changeUniversity, regularChanges]);

  const matchingProfiles = useMemo(() => {
    const query = normalize(profileQuery);
    const hasDepartmentMatch = Boolean(query && methodDisplayViews.some((row) => (
      normalize(`${displayRegion(row.r, row.u)} ${row.u} ${row.departmentName ?? ''}`).includes(query)
    )));
    return methodDisplayViews.filter((row) => {
      const departmentIdentity = normalize(`${displayRegion(row.r, row.u)} ${row.u} ${row.departmentName ?? ''}`);
      const fullSearchText = normalize(`${departmentIdentity} ${row.formal} ${row.admissionGroup} ${row.examName} ${row.trackName} ${methodTrackCategories(row).join(' ')} ${row.selectionDetail} ${row.bonusDetail} ${row.englishMethod} ${row.ratio} ${row.metric}`);
      const matchesQuery = !query || (hasDepartmentMatch ? departmentIdentity.includes(query) : fullSearchText.includes(query));
      const topDomains = highestRatioDomains(row.ratios).split('/');
      return matchesQuery
        && (profileRegion === '전체' || displayRegion(row.r, row.u) === profileRegion)
        && (profileUniversity === '전체' || row.u === profileUniversity)
        && (profileGroup === '전체' || atomicAdmissionGroups(row.admissionGroup).includes(profileGroup))
        && (profileExam === '전체' || row.examName === profileExam)
        && (profileTrack === '전체' || methodTrackCategories(row).includes(profileTrack as TrackCategory))
        && (profileEnglish === '전체' || row.englishMethod === profileEnglish)
        && (profileMetric === '전체' || row.metrics.includes(profileMetric))
        && (profileRecord === '전체' || studentRecordEvaluation(row).mode === profileRecord)
        && (profileDomainCount === '전체' || row.domainCount === Number(profileDomainCount))
        && (profileTopDomain === '전체' || topDomains.includes(profileTopDomain))
        && (profileMaximum === '전체' || (profileMaximum === '수치 있음' ? row.conversionMax !== null : row.conversionMax === null));
    });
  }, [methodDisplayViews, profileDomainCount, profileEnglish, profileExam, profileGroup, profileMaximum, profileMetric, profileQuery, profileRecord, profileRegion, profileTopDomain, profileTrack, profileUniversity]);
  const ratioProfiles = useMemo(() => sortRows(matchingProfiles, profileSort, PROFILE_SORTERS), [matchingProfiles, profileSort]);
  const profileAnalysis = useMemo(
    () => buildProfileAnalysis(matchingProfiles, profileRegion, profileUniversity),
    [matchingProfiles, profileRegion, profileUniversity],
  );
  const initialListSize = mobileBuild ? 5 : 10;
  const visibleChangeRows = changeRows.slice(0, initialListSize * changeListBatch);
  const visibleRecordRows = (data?.studentRecord ?? []).slice(0, initialListSize * recordListBatch);
  const visibleProfiles = ratioProfiles.slice(0, initialListSize * profileListBatch);

  const filteredScores = useMemo(() => {
    const query = normalize(scoreQuery);
    const percentileRange = numericRange(scorePercentileMin, scorePercentileMax);
    const convertedRange = numericRange(scoreConvertedMin, scoreConvertedMax);
    const hasPercentileRange = percentileRange.minimum !== null || percentileRange.maximum !== null;
    const hasConvertedRange = convertedRange.minimum !== null || convertedRange.maximum !== null;
    const hasDepartmentMatch = Boolean(query && scoreViews.some((row) => (
      normalize(`${displayRegion(row.r, row.u)} ${row.u} ${row.d}`).includes(query)
    )));
    const filtered = scoreViews.filter((row) => {
      const departmentIdentity = normalize(`${displayRegion(row.r, row.u)} ${row.u} ${row.d}`);
      const fullSearchText = normalize(`${departmentIdentity} ${row.a} ${row.exam ?? ''} ${row.t} ${row.ruleMatches.map((rule) => scoreMethodLabel(rule, row)).join(' ')}`);
      const matchesQuery = !query || (hasDepartmentMatch ? departmentIdentity.includes(query) : fullSearchText.includes(query));
      const representativePercentile = row.p50 ?? row.p70;
      const representativeConverted = row.cv50 ?? row.cv70;
      const matchesPercentileRange = !hasPercentileRange || (row.cutMetric === '백분위' && inNumericRange(representativePercentile, percentileRange));
      const matchesConvertedRange = !hasConvertedRange || inNumericRange(representativeConverted, convertedRange);
      return matchesQuery
        && matchesPercentileRange
        && matchesConvertedRange
        && (scoreRegion === '전체' || displayRegion(row.r, row.u) === scoreRegion)
        && (scoreUniversity === '전체' || row.u === scoreUniversity)
        && (scoreYear === '전체' || row.y === Number(scoreYear))
        && (scoreTrack === '전체' || row.t === scoreTrack)
        && (!scoreGroups.length || atomicAdmissionGroups(row.displayGroup).some((group) => scoreGroups.includes(group.replace(/군$/, ''))));
    });
    return sortRows(filtered, scoreSort, {
      y: (row) => row.y,
      r: (row) => displayRegion(row.r, row.u),
      u: (row) => row.u,
      g: (row) => row.displayGroup,
      d: (row) => row.d,
      t: (row) => row.t,
      n: (row) => row.n,
      c: (row) => row.c,
      x: (row) => row.x,
      add: (row) => row.add,
      cv50: (row) => row.cv50,
      cv70: (row) => row.cv70,
      max: (row) => row.max,
      p50: (row) => row.cutMetric === '백분위' ? row.p50 : null,
      p70: (row) => row.cutMetric === '백분위' ? row.p70 : null,
      exam: (row) => row.exam ?? row.a,
      sb: (row) => scoreStudentRecord(row),
      koreanRatio: (row) => row.ruleMatches[0]?.ratios.korean,
      mathRatio: (row) => row.ruleMatches[0]?.ratios.math,
      englishRatio: (row) => row.ruleMatches[0]?.ratios.english,
      inquiryRatio: (row) => row.ruleMatches[0]?.ratios.inquiry,
    });
  }, [scoreConvertedMax, scoreConvertedMin, scoreGroups, scorePercentileMax, scorePercentileMin, scoreQuery, scoreRegion, scoreSort, scoreTrack, scoreUniversity, scoreViews, scoreYear]);

  const visibleScores = filteredScores.slice(0, initialListSize * scoreListBatch);
  const scheduleItems = data?.overview.schedule ?? [];
  const visibleScheduleItems = scheduleItems.slice(0, initialListSize * scheduleListBatch);

  function resetFilters() {
    if (tab === 'changes') {
      setChangeQuery('');
      setChangeUniversity('전체');
      setChangeCategory('전체');
      setChangeSort({ key: 'u', direction: 'asc' });
      setChangeListBatch(1);
      setRecordListBatch(1);
    } else if (tab === 'rules') {
      setProfileQuery('');
      setProfileRegion('전체');
      setProfileUniversity('전체');
      setProfileGroup('전체');
      setProfileExam('전체');
      setProfileTrack('전체');
      setProfileEnglish('전체');
      setProfileMetric('전체');
      setProfileRecord('전체');
      setProfileDomainCount('전체');
      setProfileTopDomain('전체');
      setProfileMaximum('전체');
      setProfileSort({ key: 'u', direction: 'asc' });
      setShowPractical(false);
      setProfileListBatch(1);
    } else if (tab === 'results') {
      setScoreQuery('');
      setScoreRegion('전체');
      setScoreUniversity('전체');
      setScoreYear('전체');
      setScoreTrack('전체');
      setScoreGroups([]);
      setScorePercentileMin('');
      setScorePercentileMax('');
      setScoreConvertedMin('');
      setScoreConvertedMax('');
      setScoreSort({ key: 'y', direction: 'desc' });
      setScoreListBatch(1);
    }
  }

  function exportCurrent() {
    if (tab === 'changes') {
      downloadCsv('2027_정시_변화.csv', ['대학', '구분', '2026학년도', '2027학년도'], changeRows.map((row) => [row.u, row.category, row.previous, row.current]));
    } else if (tab === 'rules') {
      downloadCsv(
        '2027_정시_반영방법.csv',
        ['지역', '대학', '모집군', '모집전형', '계열', '모집단위', '가점 부여사항', '영어 반영방법', '백분위', '등급', '표준점수', '변환표준점수', '학생부 평가', '반영영역 수', '국어', '국어 실질 가중치', '수학', '수학 실질 가중치', '영어', '영어 실질 가중치', '탐구', '탐구 실질 가중치', '한국사', '2026 백분위', '2026 환산점수', '2026 환산만점', '전형요소', '전체 반영비율'],
        ratioProfiles.map((row) => [displayRegion(row.r, row.u), row.u, row.admissionGroup, row.examName, methodTrackCategories(row).join(', '), row.departmentName ?? row.trackName, row.bonusDetail, row.englishMethod, metricValue(row, '백분위'), metricValue(row, '등급'), metricValue(row, '표준점수'), metricValue(row, '변환표준점수'), recordLabel(row), row.domainCount, displayRatioForRow(row, 'korean'), displayWeight(row.weights.korean, row.weightLabels?.korean), displayRatioForRow(row, 'math'), displayWeight(row.weights.math, row.weightLabels?.math), displayRatioForRow(row, 'english'), displayWeight(row.weights.english, row.weightLabels?.english), displayRatioForRow(row, 'inquiry'), displayWeight(row.weights.inquiry, row.weightLabels?.inquiry), row.ratios.history, row.result2026?.percentile.label ?? '', row.result2026?.converted.label ?? '', row.result2026?.maximum.label ?? '', row.selectionDetail, row.ratio]),
      );
    } else if (tab === 'results') {
      downloadCsv(
        '정시_3개년_입시결과.csv',
        ['연도', '지역', '대학', '모집군', '모집전형', '모집단위', '계열', '백분위 50%', '백분위 70%', '모집인원', '경쟁률', '실질경쟁률', '충원인원', '환산점수 50%', '환산점수 70%', '환산만점', '2027 반영방법', '국어 반영비율', '수학 반영비율', '영어 반영비율', '탐구 반영비율'],
        filteredScores.flatMap((row) => scoreRulesForDisplay(row).map((rule) => [row.y, displayRegion(row.r, row.u), row.u, row.displayGroup, row.exam ?? '', row.d, row.t, row.cutMetric === '백분위' ? row.p50 : '', row.cutMetric === '백분위' ? row.p70 : '', row.n, row.c, row.x, row.add, row.cv50, row.cv70, row.max, rule ? scoreMethodLabel(rule, row) : '', rule ? displayRatioForRow(rule, 'korean') : '', rule ? displayRatioForRow(rule, 'math') : '', rule ? displayRatioForRow(rule, 'english') : '', rule ? displayRatioForRow(rule, 'inquiry') : ''])),
      );
    }
  }

  if (error) return <StatusScreen>{error}</StatusScreen>;
  if (!data) return <StatusScreen>불러오는 중입니다.</StatusScreen>;

  return (
    <main className="min-h-screen">
      <div className="site-shell w-full px-3 py-3 sm:px-5 lg:px-6">
        <header className="masthead">
          <div className="brand-lockup">
            <img className="brand-logo" src={ryanLogo as unknown as string} alt="" aria-hidden="true" />
            <div className="brand-title">
              <h1>라이언의 2027 정시모집</h1>
              <span className="release-version">{RELEASE_VERSION}</span>
            </div>
          </div>
          <div className="header-actions">
            <a className="toolbar-button navigation-button" href={mobileBuild ? PC_SITE_URL : MOBILE_SITE_URL}>
              {mobileBuild ? <Monitor aria-hidden="true" /> : <Smartphone aria-hidden="true" />}
              {mobileBuild ? 'PC 버전' : '모바일 버전'}
            </a>
            <Button variant="outline" className="toolbar-button theme-button" onClick={() => setThemeMode((current) => current === 'light' ? 'dark' : 'light')} aria-label={themeMode === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}>
              {themeMode === 'light' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
              {themeMode === 'light' ? '다크' : '라이트'}
            </Button>
            <a className="toolbar-button navigation-button portal-button" href={ADMISSION_PORTAL_URL}>
              <House aria-hidden="true" />라이언의 대입포털로 돌아가기
            </a>
            <Button variant="outline" className="toolbar-button" onClick={resetFilters}><RotateCcw />필터 초기화</Button>
            {tab !== 'sources' && <Button className="toolbar-button primary-button" onClick={exportCurrent}><Download />현재 결과 저장</Button>}
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="workspace">
          <TabsList variant="line" className="tabs-list">
            <TabsTrigger value="changes">정시 변화</TabsTrigger>
            <TabsTrigger value="rules">반영방법</TabsTrigger>
            <TabsTrigger value="results">3개년 입시결과</TabsTrigger>
            <TabsTrigger value="sources">일정</TabsTrigger>
          </TabsList>

          <TabsContent value="changes" className="tab-stack">
            <section className="fact-grid">
              <Fact value={formatNumber(data.overview.totalRegular)} label="전국 정시 모집인원" note={`전년보다 ${formatNumber(Math.abs(data.overview.change))}명 감소`} />
              <Fact value={`${data.overview.examFocusedRate}%`} label="수능위주 비율" note={`${formatNumber(data.overview.examFocused)}명`} />
              <Fact value={formatNumber(data.overview.groups.나)} label="나군 모집인원" note="가, 나, 다군 가운데 가장 많음" />
              <Fact value={formatNumber(data.overview.groups.다)} label="다군 모집인원" note="가, 나, 다군 가운데 가장 적음" />
            </section>

            <section className="notice-grid">
              <article><strong>감소 인원의 75%가 비수도권</strong><span>전국 감소 1,197명 중 비수도권이 903명 줄었습니다.</span></article>
              <article><strong>학생부 반영 대학은 산식 확인</strong><span>교과 정량, 교과평가, 출결처럼 반영 방식이 서로 다릅니다.</span></article>
              <article><strong>모집군 변경은 지원 조합에 영향</strong><span>같은 대학 안에서도 모집단위별 가군, 나군, 다군 이동이 있습니다.</span></article>
            </section>

            <FilterPanel>
              <SearchField value={changeQuery} onChange={setChangeQuery} placeholder="대학, 모집단위, 변경 내용 검색" />
              <FilterSelect label="대학" value={changeUniversity} onChange={setChangeUniversity} options={changeUniversities} />
              <FilterSelect label="구분" value={changeCategory} onChange={setChangeCategory} options={changeCategories} />
            </FilterPanel>

            <section className="data-panel">
              <SectionHead title="2027학년도 정시 변경사항" />
              <Table className="data-table changes-table">
                <TableHeader><TableRow>
                  <SortableHead label="대학" column="u" sort={changeSort} onSort={setChangeSort} />
                  <SortableHead label="구분" column="category" sort={changeSort} onSort={setChangeSort} />
                  <TableHead>연도</TableHead>
                  <SortableHead label="정시 변경 내용" column="current" sort={changeSort} onSort={setChangeSort} />
                </TableRow></TableHeader>
                <TableBody>
                  {visibleChangeRows.map((row) => <Fragment key={row.id}>
                    <TableRow className="change-year-row is-previous">
                      <TableCell rowSpan={2} className="university-cell change-group-cell">{row.u}</TableCell>
                      <TableCell rowSpan={2} className={`change-group-cell change-category-cell ${changeCategoryClass(row.category)}`}><span>{row.category}</span></TableCell>
                      <TableCell className="change-year-cell"><span>2026</span></TableCell>
                      <TableCell className="wrap-cell previous-cell"><ChangeContent text={row.previous} current={false} /></TableCell>
                    </TableRow>
                    <TableRow className="change-year-row is-current">
                      <TableCell className="change-year-cell"><span>2027</span></TableCell>
                      <TableCell className="wrap-cell current-cell"><ChangeContent text={row.current} current /></TableCell>
                    </TableRow>
                  </Fragment>)}
                </TableBody>
              </Table>
              {changeRows.length === 0 ? <EmptyState /> : <ListDisclosure total={changeRows.length} shown={visibleChangeRows.length} initial={initialListSize} onExpand={() => setChangeListBatch((value) => value + 1)} onCollapse={() => setChangeListBatch(1)} />}
            </section>

            <section className="data-panel">
              <div className="section-head"><div><h2>학생부 반영 사례</h2></div></div>
              <Table className="data-table record-table">
                <TableHeader><TableRow><TableHead>대학</TableHead><TableHead>전형방법</TableHead><TableHead>평가 방식</TableHead></TableRow></TableHeader>
                <TableBody>{visibleRecordRows.map((row) => <TableRow key={`${row.u}-${row.method}`}>
                  <TableCell className="university-cell">{row.u}</TableCell><TableCell>{row.method}</TableCell><TableCell>{row.type}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
              <ListDisclosure total={data.studentRecord.length} shown={visibleRecordRows.length} initial={initialListSize} onExpand={() => setRecordListBatch((value) => value + 1)} onCollapse={() => setRecordListBatch(1)} />
            </section>
          </TabsContent>

          <TabsContent value="rules" className="tab-stack">
            <FilterPanel wide>
              <SearchField value={profileQuery} onChange={(value) => { setProfileQuery(value); setProfileListBatch(1); }} placeholder="대학, 전형, 계열, 모집단위 검색" />
              <FilterSelect label="지역" value={profileRegion} onChange={(value) => { setProfileRegion(value); setProfileListBatch(1); }} options={profileRegions} />
              <FilterSelect label="대학" value={profileUniversity} onChange={(value) => { setProfileUniversity(value); setProfileListBatch(1); }} options={profileUniversities} />
              <FilterSelect label="모집군" value={profileGroup} onChange={(value) => { setProfileGroup(value); setProfileListBatch(1); }} options={profileGroups} />
              <FilterSelect label="모집전형" value={profileExam} onChange={(value) => { setProfileExam(value); setProfileListBatch(1); }} options={profileExams} />
              <FilterSelect label="계열" value={profileTrack} onChange={(value) => { setProfileTrack(value); setProfileListBatch(1); }} options={profileTracks} />
              <FilterSelect label="영어 방식" value={profileEnglish} onChange={(value) => { setProfileEnglish(value); setProfileListBatch(1); }} options={profileEnglishMethods} />
              <FilterSelect label="활용지표" value={profileMetric} onChange={(value) => { setProfileMetric(value); setProfileListBatch(1); }} options={['표준점수', '변환표준점수', '백분위', '등급']} />
              <FilterSelect label="학생부" value={profileRecord} onChange={(value) => { setProfileRecord(value); setProfileListBatch(1); }} options={['정성평가', '정량평가', '미반영', '미기재']} />
              <FilterSelect label="반영영역 수" value={profileDomainCount} onChange={(value) => { setProfileDomainCount(value); setProfileListBatch(1); }} options={profileDomainCounts} />
              <FilterSelect label="최고 반영영역" value={profileTopDomain} onChange={(value) => { setProfileTopDomain(value); setProfileListBatch(1); }} options={['국어', '수학', '영어', '탐구']} />
              <FilterSelect label="2026 환산만점" value={profileMaximum} onChange={(value) => { setProfileMaximum(value); setProfileListBatch(1); }} options={['수치 있음', '수치 없음']} />
            </FilterPanel>

            <section className="method-analysis" aria-live="polite">
              <strong>{profileAnalysis.title}</strong>
              {profileAnalysis.items.map((item) => <span key={item.label}><small>{item.label}</small>{item.value}</span>)}
            </section>

            <section className="data-panel">
              <div className="section-head">
                <div><h2>영역별 반영비율</h2></div>
                <div className="section-tools">
                  <fieldset className="reflection-toggle">
                    <legend className="sr-only">반영비율 표시 방식</legend>
                    <span className={!showPractical ? 'is-active' : ''}>명목 %</span>
                    <Checkbox checked={showPractical} onCheckedChange={(checked) => {
                      const next = checked === true;
                      setShowPractical(next);
                      setProfileSort((current) => ({ ...current, key: reflectionSortKey(current.key, next) }));
                    }} aria-label="명목 반영비율과 실질 가중치 전환" />
                    <span className={showPractical ? 'is-active' : ''}>실질 가중치</span>
                  </fieldset>
                  <div className="ratio-legend"><span className="high">최고</span><span className="low">최저</span></div>
                </div>
              </div>
              <Table className="data-table ratio-table" style={{ '--department-column-width': `${departmentColumnWidth}px` } as React.CSSProperties}>
                <TableHeader><TableRow>
                  <SortableHead label="지역" column="r" sort={profileSort} onSort={setProfileSort} />
                  <SortableHead label="대학" column="u" sort={profileSort} onSort={setProfileSort} />
                  <SortableHead label="모집군" column="admissionGroup" sort={profileSort} onSort={setProfileSort} />
                  <SortableHead label="모집전형" column="examName" sort={profileSort} onSort={setProfileSort} />
                  <SortableHead label="계열" column="trackCategory" sort={profileSort} onSort={setProfileSort} />
                  <SortableHead label="모집단위" column="departmentName" sort={profileSort} onSort={setProfileSort} width={departmentColumnWidth} onWidthChange={setDepartmentColumnWidth} />
                </TableRow></TableHeader>
                <TableBody>{visibleProfiles.map((row) => <Fragment key={row.rowId}><TableRow className="method-row">
                  <TableCell className="muted-cell">{displayRegion(row.r, row.u)}</TableCell>
                  <TableCell><UniversityMethodCell row={row} expanded={expandedMethodRows.has(row.rowId)} onToggle={() => toggleMethodDetails(row.rowId)} onOpen={() => setSelectedProfile(row)} /></TableCell>
                  <TableCell className="group-cell">{row.admissionGroup}</TableCell>
                  <TableCell className="exam-cell">{row.examName}</TableCell>
                  <TableCell className="track-cell">{methodTrackCategories(row).join(', ')}</TableCell>
                  <TableCell className="method-department-cell" title={row.departmentName ?? row.trackName}>{row.departmentName ?? row.trackName}</TableCell>
                </TableRow>
                  <MethodSummaryRow row={row} practical={showPractical} sort={profileSort} onSort={setProfileSort} />
                  {expandedMethodRows.has(row.rowId) && <MethodDetailRow row={row} colSpan={6} />}
                </Fragment>)}</TableBody>
              </Table>
              {ratioProfiles.length === 0 ? <EmptyState /> : <ListDisclosure total={ratioProfiles.length} shown={visibleProfiles.length} initial={initialListSize} onExpand={() => setProfileListBatch((value) => value + 1)} onCollapse={() => setProfileListBatch(1)} />}
            </section>
          </TabsContent>

          <TabsContent value="results" className="tab-stack">
            <FilterPanel wide>
              <SearchField value={scoreQuery} onChange={(value) => { setScoreQuery(value); setScoreListBatch(1); }} placeholder="대학, 모집단위, 전형명 검색" />
              <FilterSelect label="연도" value={scoreYear} onChange={(value) => { setScoreYear(value); setScoreListBatch(1); }} options={['2026', '2025', '2024']} />
              <FilterSelect label="지역" value={scoreRegion} onChange={(value) => { setScoreRegion(value); setScoreListBatch(1); }} options={scoreRegions} />
              <FilterSelect label="대학" value={scoreUniversity} onChange={(value) => { setScoreUniversity(value); setScoreListBatch(1); }} options={scoreUniversities} />
              <FilterSelect label="계열" value={scoreTrack} onChange={(value) => { setScoreTrack(value); setScoreListBatch(1); }} options={scoreTracks} />
              <GroupCheckboxFilter values={scoreGroups} onChange={(values) => { setScoreGroups(values); setScoreListBatch(1); }} />
              <RangeFilter label="백분위 범위" unit="%" minimum={scorePercentileMin} maximum={scorePercentileMax} onMinimumChange={(value) => { setScorePercentileMin(value); setScoreListBatch(1); }} onMaximumChange={(value) => { setScorePercentileMax(value); setScoreListBatch(1); }} max={100} />
              <RangeFilter label="환산점수 범위" unit="점" minimum={scoreConvertedMin} maximum={scoreConvertedMax} onMinimumChange={(value) => { setScoreConvertedMin(value); setScoreListBatch(1); }} onMaximumChange={(value) => { setScoreConvertedMax(value); setScoreListBatch(1); }} />
            </FilterPanel>

            <section className="data-panel">
              <div className="section-head">
                <div><h2>2024학년도부터 2026학년도 정시 입시결과</h2></div>
              </div>
              <Table className="data-table results-table results-table-wide">
                <TableHeader><TableRow>
                  <SortableHead label="연도" column="y" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="지역" column="r" sort={scoreSort} onSort={setScoreSort} />
                  <SortableHead label="대학" column="u" sort={scoreSort} onSort={setScoreSort} />
                  <SortableHead label="모집군" column="g" sort={scoreSort} onSort={setScoreSort} />
                  <SortableHead label="모집단위" column="d" sort={scoreSort} onSort={setScoreSort} />
                  <SortableHead label="계열" column="t" sort={scoreSort} onSort={setScoreSort} />
                  <SortableHead label="백분위 50%" column="p50" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="백분위 70%" column="p70" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="모집인원" column="n" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="경쟁률" column="c" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="실질경쟁률" column="x" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="충원인원" column="add" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="환산점수 70%" column="cv70" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="환산만점" column="max" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="국어 반영" column="koreanRatio" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="수학 반영" column="mathRatio" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="영어 반영" column="englishRatio" sort={scoreSort} onSort={setScoreSort} align="right" />
                  <SortableHead label="탐구 반영" column="inquiryRatio" sort={scoreSort} onSort={setScoreSort} align="right" />
                </TableRow></TableHeader>
                <TableBody>{visibleScores.map((row) => <Fragment key={row.id}>
                  <TableRow className={`score-result-row ${expandedScoreRows.has(row.id) ? 'is-expanded' : ''}`}>
                    <TableCell className="year-cell">{row.y}</TableCell>
                    <TableCell className="muted-cell">{displayRegion(row.r, row.u)}</TableCell>
                    <TableCell><UniversityScoreCell row={row} expanded={expandedScoreRows.has(row.id)} onToggle={() => toggleScoreDetails(row.id)} onOpen={() => setSelectedScore(row)} /></TableCell>
                    <TableCell className="group-cell"><AdmissionGroupLights group={row.displayGroup} /></TableCell>
                    <TableCell className="department-cell" title={`${row.d} ${conciseExamName(row)}`}><strong>{row.d}</strong><small>{conciseExamName(row)}</small></TableCell>
                    <TableCell className="score-track-cell">{row.t || '—'}</TableCell>
                    <PercentileCutCell value={row.cutMetric === '백분위' ? row.p50 : null} />
                    <PercentileCutCell value={row.cutMetric === '백분위' ? row.p70 : null} />
                    <NumberCell value={row.n} />
                    <NumberCell value={row.c} suffix=":1" fixedDecimals />
                    <NumberCell value={row.x} suffix=":1" fixedDecimals />
                    <NumberCell value={row.add} />
                    <NumberCell value={row.cv70} suffix="점" grouping={false} fixedDecimals />
                    <NumberCell value={row.max} grouping={false} />
                    <TableCell colSpan={4} className="score-rule-heading">2027학년도 수능 반영비율</TableCell>
                  </TableRow>
                  {expandedScoreRows.has(row.id) && row.missingReason && <TableRow className="score-missing-row"><TableCell colSpan={18}><strong>미공개 사유</strong><span>{row.missingReason}</span></TableCell></TableRow>}
                  {expandedScoreRows.has(row.id) && scoreRulesForDisplay(row).map((rule, index) => <TableRow className="score-rule-row" key={`${row.id}-rule-${index}`}>
                    <TableCell colSpan={14} className="score-rule-name">{row.exam && <span className="historical-exam">{row.y} {row.exam}</span>}{rule ? scoreMethodLabel(rule, row) : '2027학년도 반영방법 미연결'}</TableCell>
                    {rule ? <>
                      <RatioCell row={rule} domain="korean" />
                      <RatioCell row={rule} domain="math" />
                      <RatioCell row={rule} domain="english" />
                      <RatioCell row={rule} domain="inquiry" />
                    </> : <><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell></>}
                  </TableRow>)}
                </Fragment>)}</TableBody>
              </Table>
              <Table className="data-table results-table-pivot">
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2}><button className="sort-button" onClick={() => setScoreSort({ key: 'y', direction: scoreSort.key === 'y' && scoreSort.direction === 'asc' ? 'desc' : 'asc' })}>학년도<ArrowUpDown aria-hidden="true" /></button></TableHead>
                    <TableHead rowSpan={2}><button className="sort-button" onClick={() => setScoreSort({ key: 'r', direction: scoreSort.key === 'r' && scoreSort.direction === 'asc' ? 'desc' : 'asc' })}>지역<ArrowUpDown aria-hidden="true" /></button></TableHead>
                    <TableHead rowSpan={2}><button className="sort-button" onClick={() => setScoreSort({ key: 'u', direction: scoreSort.key === 'u' && scoreSort.direction === 'asc' ? 'desc' : 'asc' })}>대학<ArrowUpDown aria-hidden="true" /></button></TableHead>
                    <TableHead rowSpan={2}><button className="sort-button" onClick={() => setScoreSort({ key: 'g', direction: scoreSort.key === 'g' && scoreSort.direction === 'asc' ? 'desc' : 'asc' })}>모집군<ArrowUpDown aria-hidden="true" /></button></TableHead>
                    <TableHead rowSpan={2}><button className="sort-button" onClick={() => setScoreSort({ key: 'd', direction: scoreSort.key === 'd' && scoreSort.direction === 'asc' ? 'desc' : 'asc' })}>모집단위<ArrowUpDown aria-hidden="true" /></button></TableHead>
                    <TableHead rowSpan={2}><button className="sort-button" onClick={() => setScoreSort({ key: 't', direction: scoreSort.key === 't' && scoreSort.direction === 'asc' ? 'desc' : 'asc' })}>계열<ArrowUpDown aria-hidden="true" /></button></TableHead>
                    <SortableHead label="백분위 50%" column="p50" sort={scoreSort} onSort={setScoreSort} align="right" />
                    <SortableHead label="백분위 70%" column="p70" sort={scoreSort} onSort={setScoreSort} align="right" />
                  </TableRow>
                  <TableRow className="pivot-converted-head">
                    <TableHead className="number-head converted-head-label">환산점수 50%</TableHead>
                    <TableHead className="number-head converted-head-label">환산점수 70%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{visibleScores.map((row) => <Fragment key={`pivot-${row.id}`}>
                  <TableRow className={`pivot-result-main ${expandedScoreRows.has(row.id) ? 'is-expanded' : ''}`}>
                    <TableCell rowSpan={2} className="year-cell">{row.y}</TableCell>
                    <TableCell rowSpan={2} className="muted-cell">{displayRegion(row.r, row.u)}</TableCell>
                    <TableCell rowSpan={2}><UniversityScoreCell row={row} expanded={expandedScoreRows.has(row.id)} onToggle={() => toggleScoreDetails(row.id)} onOpen={() => setSelectedScore(row)} /></TableCell>
                    <TableCell rowSpan={2} className="group-cell"><AdmissionGroupLights group={row.displayGroup} /></TableCell>
                    <TableCell rowSpan={2} className="department-cell" title={`${row.d} ${conciseExamName(row)}`}><strong>{row.d}</strong><small>{conciseExamName(row)}</small></TableCell>
                    <TableCell rowSpan={2} className="score-track-cell">{row.t || '—'}</TableCell>
                    <PercentileCutCell value={row.cutMetric === '백분위' ? row.p50 : null} />
                    <PercentileCutCell value={row.cutMetric === '백분위' ? row.p70 : null} />
                  </TableRow>
                  <TableRow className="pivot-result-converted">
                    <NumberCell value={row.cv50} suffix="점" grouping={false} fixedDecimals />
                    <NumberCell value={row.cv70} suffix="점" grouping={false} fixedDecimals />
                  </TableRow>
                  {expandedScoreRows.has(row.id) && <TableRow className="pivot-result-stats"><TableCell colSpan={8}>
                    <div className="pivot-stat-grid">
                      <CompactSortValue label="모집인원" column="n" value={compactNumber(row.n)} sort={scoreSort} onSort={setScoreSort} />
                      <CompactSortValue label="경쟁률" column="c" value={compactFixedNumber(row.c, ':1')} sort={scoreSort} onSort={setScoreSort} />
                      <CompactSortValue label="실질경쟁률" column="x" value={compactFixedNumber(row.x, ':1')} sort={scoreSort} onSort={setScoreSort} />
                      <CompactSortValue label="충원인원" column="add" value={compactNumber(row.add)} sort={scoreSort} onSort={setScoreSort} />
                      <CompactSortValue label="전형" column="exam" value={row.exam ?? row.a} sort={scoreSort} onSort={setScoreSort} />
                      <CompactSortValue label="환산만점" column="max" value={compactNumber(row.max, '', false)} sort={scoreSort} onSort={setScoreSort} />
                      <CompactSortValue label="학생부" column="sb" value={scoreStudentRecord(row)} sort={scoreSort} onSort={setScoreSort} />
                    </div>
                  </TableCell></TableRow>}
                  {expandedScoreRows.has(row.id) && row.missingReason && <TableRow className="score-missing-row"><TableCell colSpan={8}><strong>미공개 사유</strong><span>{row.missingReason}</span></TableCell></TableRow>}
                  {expandedScoreRows.has(row.id) && <TableRow className="pivot-result-rules"><TableCell colSpan={8}>
                    <div className="pivot-rule-stack">
                      {scoreRulesForDisplay(row).map((rule, index) => <div className="pivot-rule-card" key={`pivot-${row.id}-rule-${index}`}>
                        <div className="pivot-rule">
                          <strong>{row.exam && <span className="historical-exam">{row.y} {row.exam}</span>}{rule ? scoreMethodLabel(rule, row) : '2027학년도 반영방법 미연결'}</strong>
                          <CompactRatio label="국어" column="koreanRatio" rule={rule} domain="korean" sort={scoreSort} onSort={setScoreSort} />
                          <CompactRatio label="수학" column="mathRatio" rule={rule} domain="math" sort={scoreSort} onSort={setScoreSort} />
                          <CompactRatio label="영어" column="englishRatio" rule={rule} domain="english" sort={scoreSort} onSort={setScoreSort} />
                          <CompactRatio label="탐구" column="inquiryRatio" rule={rule} domain="inquiry" sort={scoreSort} onSort={setScoreSort} />
                        </div>
                        {rule && <div className="pivot-method-meta">
                          <span><small>반영영역</small><strong>{reflectedDomains(rule)}</strong></span>
                          <span><small>영어 반영 방법</small><strong>{rule.englishMethod}</strong></span>
                          <span><small>활용지표</small><strong>{rule.metrics.join(', ') || '—'}</strong></span>
                          <span><small>학생부</small><strong>{recordLabel(rule)}</strong></span>
                        </div>}
                      </div>)}
                    </div>
                  </TableCell></TableRow>}
                </Fragment>)}</TableBody>
              </Table>
              {filteredScores.length === 0 ? <EmptyState /> : <ListDisclosure total={filteredScores.length} shown={visibleScores.length} initial={initialListSize} onExpand={() => setScoreListBatch((value) => value + 1)} onCollapse={() => setScoreListBatch(1)} />}
            </section>
          </TabsContent>

          <TabsContent value="sources" className="tab-stack">
            <section className="data-panel schedule-panel">
              <div className="section-head schedule-head"><CalendarDays aria-hidden="true" /><div><h2>2027학년도 정시 일정</h2></div></div>
              <div className="schedule-list">{visibleScheduleItems.map((item, index) => <div key={item.label}><b aria-hidden="true">{String(index + 1).padStart(2, '0')}</b><strong>{item.label}</strong><span>{item.value}</span></div>)}</div>
              <ListDisclosure total={data.overview.schedule.length} shown={visibleScheduleItems.length} initial={initialListSize} onExpand={() => setScheduleListBatch((value) => value + 1)} onCollapse={() => setScheduleListBatch(1)} />
            </section>
          </TabsContent>
        </Tabs>
      </div>

      {selectedProfile && <DetailModal title={selectedProfile.formal} description={`${selectedProfile.r} | ${selectedProfile.admissionGroup} | ${selectedProfile.examName} | ${selectedProfile.trackName}`} onClose={() => setSelectedProfile(null)}>
            <DetailBlock title="전형요소" text={selectedProfile.selectionDetail} />
            <DetailBlock title="영어 반영방법" text={selectedProfile.englishMethod} />
            <DetailBlock title="학생부 반영" text={recordLabel(selectedProfile)} />
            <DetailBlock title="영역별 반영비율" text={selectedProfile.ratio || selectedProfile.metric} />
            <DetailBlock title="가점 부여사항" text={selectedProfile.bonusDetail} />
            <div className="dialog-links">
              {selectedProfile.officialSourcePath && <a href={localFileHref(selectedProfile.officialSourcePath)} target="_blank" rel="noreferrer">2027 정시 모집요강{selectedProfile.officialSourcePages?.length ? ` ${selectedProfile.officialSourcePages.join(', ')}쪽` : ''} <ExternalLink /></a>}
              {selectedProfile.admission && <a href={selectedProfile.admission} target="_blank" rel="noreferrer">입학처 <ExternalLink /></a>}
              {selectedProfile.resultSource && <a href={selectedProfile.resultSource} target="_blank" rel="noreferrer">대입정보포털 <ExternalLink /></a>}
            </div>
      </DetailModal>}

      {selectedScore && <DetailModal title={`${selectedScore.u} ${selectedScore.d}`} description={`${selectedScore.y}학년도 ${selectedScore.a}${selectedScore.exam ? ` | ${selectedScore.exam}` : ''}`} onClose={() => setSelectedScore(null)}>
            <div className="score-detail-grid">
              <DetailNumber label="모집인원" value={selectedScore.n} />
              <DetailNumber label="경쟁률" value={selectedScore.c} suffix=":1" fixedDecimals />
              <DetailNumber label="실질경쟁률" value={selectedScore.x} suffix=":1" fixedDecimals />
              <DetailNumber label="충원" value={selectedScore.add} />
              <DetailNumber label="환산점수 70%" value={selectedScore.cv70} suffix="점" grouping={false} fixedDecimals />
              <DetailNumber label="환산점수 만점" value={selectedScore.max} grouping={false} />
              <DetailNumber label="백분위 50%" value={selectedScore.cutMetric === '백분위' ? selectedScore.p50 : null} suffix="%" grouping={false} fixedDecimals />
              <DetailNumber label="백분위 70%" value={selectedScore.cutMetric === '백분위' ? selectedScore.p70 : null} suffix="%" grouping={false} fixedDecimals />
            </div>
            <DetailBlock title="2027학년도 수능 반영방법" text={scoreRulesForDisplay(selectedScore).map((rule) => rule ? scoreMethodLabel(rule, selectedScore) : '반영방법 미연결').join(' / ')} />
            {selectedScore.missingReason && <DetailBlock title="미공개 사유" text={selectedScore.missingReason} />}
            <div className="dialog-links">
              {selectedScore.admission && <a href={selectedScore.admission} target="_blank" rel="noreferrer">입학처 <ExternalLink /></a>}
              {selectedScore.source && <a href={selectedScore.source} target="_blank" rel="noreferrer">대입정보포털 <ExternalLink /></a>}
            </div>
      </DetailModal>}
    </main>
  );
}

function Fact({ value, label, note }: { value: string; label: string; note: string }) {
  return <article className="fact"><strong>{value}</strong><div><span>{label}</span><small>{note}</small></div></article>;
}

function ChangeContent({ text, current }: { text: string; current: boolean }) {
  const lines = text
    .split(/\s*(?=※)|\s*;\s*|\s+\/\s+(?=[가-힣])/)
    .map((line) => line.trim())
    .filter(Boolean);
  return <div className={`change-content ${current ? 'is-current' : 'is-previous'}`}>
    {lines.map((line, index) => <p key={`${index}-${line}`}>
      {current ? <ArrowRight aria-hidden="true" /> : <Minus aria-hidden="true" />}
      <span>{line}</span>
    </p>)}
  </div>;
}

function MethodSummaryRow({ row, practical, sort, onSort }: { row: MethodView; practical: boolean; sort: SortState; onSort: (sort: SortState) => void }) {
  const ratioItem = (label: string, domain: DomainKey) => {
    const nominal = row.ratios[domain];
    const practicalValue = row.weights[domain];
    const fallback = practical ? row.weightLabels?.[domain] : row.ratioLabels?.[domain];
    const value = practical
      ? practicalValue === null ? fallback ?? '—' : `${practicalValue.toFixed(2)}배`
      : nominal === null ? fallback ?? '—' : `${formatNumber(nominal)}%`;
    const source = practical ? row.weights : row.ratios;
    return <MethodSummaryValue
      key={domain}
      label={label}
      column={practical ? `${domain}Weight` : domain}
      value={value}
      tone={ratioTone(source, domain)}
      sort={sort}
      onSort={onSort}
    />;
  };
  return <TableRow className="method-summary-row"><TableCell colSpan={6}>
    <div className="method-summary-grid">
      {ratioItem('국어', 'korean')}
      {ratioItem('수학', 'math')}
      {ratioItem('영어', 'english')}
      {ratioItem('탐구', 'inquiry')}
      <MethodSummaryValue label="영어 방식" column="englishMethod" value={row.englishMethod || '—'} sort={sort} onSort={onSort} />
      <MethodSummaryValue label="한국사" column="history" value={row.ratios.history} sort={sort} onSort={onSort} />
      <MethodSummaryValue label="2026 백분위 50/70" column="percentile2026" value={methodResultSummaryValue(row, 'percentile')} sort={sort} onSort={onSort} />
      <MethodSummaryValue label="2026 환산점수 50/70" column="converted2026" value={methodResultSummaryValue(row, 'converted')} sort={sort} onSort={onSort} />
      <MethodSummaryValue label="2026 환산만점" column="conversionMax" value={row.conversionMax === null ? '—' : formatPlainNumber(row.conversionMax)} sort={sort} onSort={onSort} />
      <div className="method-summary-metrics"><span>활용지표</span><strong>{row.metrics.join(', ') || '—'}</strong></div>
      <MethodSummaryValue label="학생부" column="sb" value={recordLabel(row)} sort={sort} onSort={onSort} />
    </div>
  </TableCell></TableRow>;
}

function MethodSummaryValue({ label, column, value, tone = '', sort, onSort }: { label: string; column: string; value: string; tone?: string; sort: SortState; onSort: (sort: SortState) => void }) {
  const active = sort.key === column;
  const nextDirection: SortDirection = active && sort.direction === 'asc' ? 'desc' : 'asc';
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <button type="button" className={`method-summary-value ${tone} ${active ? 'is-active' : ''}`} onClick={() => onSort({ key: column, direction: nextDirection })}>
    <span>{label}<Icon aria-hidden="true" /></span><strong>{value}</strong>
  </button>;
}

function methodResultSummaryValue(row: MethodView, key: keyof Pick<MethodResultSummary, 'percentile' | 'converted'>) {
  const count = row.result2026Rows?.length ?? 0;
  if (count > 1) return `${count}개 모집단위`;
  return row.result2026?.[key].label ?? '—';
}

function CompactSortValue({ label, column, value, sort, onSort }: { label: string; column: string; value: string; sort: SortState; onSort: (sort: SortState) => void }) {
  const active = sort.key === column;
  const nextDirection: SortDirection = active && sort.direction === 'asc' ? 'desc' : 'asc';
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <button type="button" className={`compact-sort-value ${active ? 'is-active' : ''}`} onClick={() => onSort({ key: column, direction: nextDirection })}>
    <span>{label}<Icon aria-hidden="true" /></span><strong>{value}</strong>
  </button>;
}

function CompactRatio({ label, column, rule, domain, sort, onSort }: { label: string; column: string; rule: MethodView | null; domain: DomainKey; sort: SortState; onSort: (sort: SortState) => void }) {
  const value = rule ? displayRatioForRow(rule, domain) : '';
  const display = typeof value === 'number' ? `${formatFixedNumber(value)}%` : value || '—';
  const weight = rule
    ? rule.weights[domain] === null
      ? rule.weightLabels?.[domain] ?? '—'
      : `${rule.weights[domain].toFixed(2)}배`
    : '—';
  const tone = rule ? ratioTone(rule.ratios, domain) : '';
  const active = sort.key === column;
  const nextDirection: SortDirection = active && sort.direction === 'asc' ? 'desc' : 'asc';
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <button type="button" className={`compact-ratio ${tone} ${active ? 'is-active' : ''}`} onClick={() => onSort({ key: column, direction: nextDirection })}>
    <span>{label}<Icon aria-hidden="true" /></span><strong>{display}</strong><small>{weight}</small>
  </button>;
}

function FilterPanel({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <section className={`filter-panel ${wide ? 'filter-panel-wide' : ''}`}>{children}</section>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="search-field"><Search className="search-icon" aria-hidden="true" /><Input aria-label="검색" value={value} onChange={(event) => onChange(event.target.value)} className="search-input" placeholder={placeholder} /></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="filter-field"><span>{label}</span><NativeSelect value={value} onChange={(event) => onChange(event.target.value)} className="w-full"><NativeSelectOption value="전체">전체</NativeSelectOption>{options.map((option) => <NativeSelectOption value={option} key={option}>{option}</NativeSelectOption>)}</NativeSelect></label>;
}

function RangeFilter({ label, unit, minimum, maximum, onMinimumChange, onMaximumChange, max }: { label: string; unit: string; minimum: string; maximum: string; onMinimumChange: (value: string) => void; onMaximumChange: (value: string) => void; max?: number }) {
  return <fieldset className="filter-field range-filter">
    <legend>{label}<small>50% 우선</small></legend>
    <div>
      <Input aria-label={`${label} 최저`} type="number" inputMode="decimal" min="0" max={max} step="0.01" value={minimum} onChange={(event) => onMinimumChange(event.target.value)} placeholder="최저" />
      <span>부터</span>
      <Input aria-label={`${label} 최고`} type="number" inputMode="decimal" min="0" max={max} step="0.01" value={maximum} onChange={(event) => onMaximumChange(event.target.value)} placeholder="최고" />
      <b>{unit}</b>
    </div>
  </fieldset>;
}

function GroupCheckboxFilter({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const toggle = (group: string, checked: boolean) => {
    const next = checked ? [...new Set([...values, group])] : values.filter((value) => value !== group);
    onChange(next);
  };
  return <fieldset className="filter-field group-checkbox-filter">
    <legend>모집군</legend>
    <div>{['가', '나', '다'].map((group) => <label className={`group-check group-${group}`} key={group}>
      <Checkbox checked={values.includes(group)} onCheckedChange={(checked) => toggle(group, checked === true)} aria-label={`${group}군`} />
      <span>{group}군</span>
    </label>)}</div>
  </fieldset>;
}

function SectionHead({ title }: { title: string }) {
  return <div className="section-head"><div><h2>{title}</h2></div></div>;
}

function SortableHead({ label, column, sort, onSort, align = 'left', width, onWidthChange }: { label: string; column: string; sort: SortState; onSort: (sort: SortState) => void; align?: 'left' | 'right'; width?: number; onWidthChange?: (width: number) => void }) {
  const active = sort.key === column;
  const nextDirection: SortDirection = active && sort.direction === 'asc' ? 'desc' : 'asc';
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <TableHead className={`${align === 'right' ? 'number-head' : ''} ${onWidthChange ? 'resizable-head' : ''}`} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} style={width ? { width, minWidth: width, maxWidth: width } : undefined}>
    <button className={`sort-button ${align === 'right' ? 'justify-end' : ''}`} onClick={() => onSort({ key: column, direction: nextDirection })}>{label}<Icon aria-hidden="true" /></button>
    {width && onWidthChange && <button type="button" className="column-resizer" aria-label={`${label} 열 너비 조절`} onPointerDown={(event) => startColumnResize(event, width, onWidthChange)} onDoubleClick={(event) => { event.stopPropagation(); onWidthChange(220); }} />}
  </TableHead>;
}

function startColumnResize(event: React.PointerEvent<HTMLButtonElement>, width: number, onWidthChange: (width: number) => void) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const previousCursor = document.body.style.cursor;
  const previousSelection = document.body.style.userSelect;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const move = (moveEvent: PointerEvent) => {
    onWidthChange(Math.min(560, Math.max(140, width + moveEvent.clientX - startX)));
  };
  const stop = () => {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousSelection;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop, { once: true });
}

function NumberCell({ value, suffix = '', className = '', grouping = true, fixedDecimals = false }: { value: number | null | undefined; suffix?: string; className?: string; grouping?: boolean; fixedDecimals?: boolean }) {
  const formatted = value === null || value === undefined
    ? '—'
    : fixedDecimals
      ? formatFixedNumber(value, grouping)
      : grouping ? formatNumber(value) : formatPlainNumber(value);
  return <TableCell className={`number-cell ${className}`}>{formatted === '—' ? formatted : `${formatted}${suffix}`}</TableCell>;
}

function PercentileCutCell({ value }: { value: number | null }) {
  return <TableCell className="number-cell score-cut-cell">
    {value === null ? <span className="unpublished-value">미공개</span> : <strong>{formatFixedNumber(value, false)}%</strong>}
  </TableCell>;
}

function RatioCell({ row, domain }: { row: MethodView; domain: DomainKey }) {
  const value = row.ratios[domain];
  const label = row.ratioLabels?.[domain];
  if (value !== null) return <NumberCell value={value} suffix="%" className={ratioTone(row.ratios, domain)} />;
  return <TableCell className={label ? 'dynamic-ratio-cell' : 'number-cell muted-cell'}>{label ?? '—'}</TableCell>;
}

function UniversityMethodCell({ row, expanded, onToggle, onOpen }: { row: MethodView; expanded: boolean; onToggle: () => void; onOpen: () => void }) {
  return <div className="university-method-cell">
    <button type="button" className="expand-method-button" aria-expanded={expanded} aria-label={`${row.u} 상세 ${expanded ? '접기' : '펼치기'}`} onClick={onToggle}>{expanded ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}</button>
    <button type="button" className="table-link" onClick={onOpen}>{row.u}</button>
  </div>;
}

function UniversityScoreCell({ row, expanded, onToggle, onOpen }: { row: ScoreView; expanded: boolean; onToggle: () => void; onOpen: () => void }) {
  return <div className="university-method-cell">
    <button type="button" className="expand-method-button" aria-expanded={expanded} aria-label={`${row.u} 입시결과 ${expanded ? '접기' : '펼치기'}`} onClick={onToggle}>{expanded ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}</button>
    <button type="button" className="table-link" onClick={onOpen}>{row.u}</button>
  </div>;
}

function AdmissionGroupLights({ group }: { group: string }) {
  const activeGroups = new Set(atomicAdmissionGroups(group));
  return <span className="admission-group-lights" aria-label={group || '모집군 없음'}>
    {['가', '나', '다'].map((item) => <span key={item} className={`group-light group-${item} ${activeGroups.has(`${item}군`) ? 'is-on' : ''}`} aria-hidden="true">{item}</span>)}
  </span>;
}

function MethodDetailRow({ row, colSpan }: { row: MethodView; colSpan: number }) {
  const notes: string[] = [];
  if (row.bonusDetail && row.bonusDetail !== '없음') {
    notes.push(/가산|가점|감점|응시|미반영/.test(row.bonusDetail) ? row.bonusDetail : `가점 ${row.bonusDetail}`);
  }
  const sourceText = `${row.ratio} ${row.metric}`;
  if (row.ratios.history === '미반영' && /한국사.{0,30}(?:필수\s*응시|응시\s*필수|필수)/.test(sourceText) && !notes.some((note) => note.includes('한국사'))) {
    notes.push('한국사 응시 필수, 점수 미반영');
  }
  const special = notes.join(', ') || '—';
  const history = row.ratios.history;
  return <TableRow className="method-detail-row">
    <TableCell colSpan={colSpan}>
      <div className="method-detail-lines">
        <p><strong><Search aria-hidden="true" />모집단위</strong><span>{row.departmentName ?? row.trackName}</span></p>
        <p><strong><Sparkles aria-hidden="true" />특이사항</strong><span>{special}</span></p>
        <p><strong><Languages aria-hidden="true" />영어 반영방법</strong><span>{row.englishMethod || '별도 표기 없음'}</span><strong><Landmark aria-hidden="true" />한국사 반영방법</strong><span>{history}</span><strong>학생부</strong><span>{recordLabel(row)}</span></p>
      </div>
    </TableCell>
  </TableRow>;
}

function ListDisclosure({ total, shown, initial, onExpand, onCollapse }: { total: number; shown: number; initial: number; onExpand: () => void; onCollapse: () => void }) {
  if (total <= initial) return null;
  return <div className="list-disclosure">
    {shown < total && <Button type="button" variant="outline" size="sm" onClick={onExpand}>펼치기</Button>}
    {shown > initial && <Button type="button" variant="outline" size="sm" onClick={onCollapse}>접기</Button>}
  </div>;
}

function DetailBlock({ title, text }: { title: string; text: string }) {
  return <section className="detail-block"><h3>{title}</h3><p>{text || '—'}</p></section>;
}

function DetailModal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="detail-overlay">
    <dialog open className="detail-dialog" aria-label={title}>
      <header className="detail-dialog-head"><div><h2>{title}</h2><p>{description}</p></div><Button variant="ghost" size="sm" onClick={onClose}>닫기</Button></header>
      {children}
    </dialog>
  </div>;
}

function DetailNumber({ label, value, suffix = '', grouping = true, fixedDecimals = false }: { label: string; value: number | null; suffix?: string; grouping?: boolean; fixedDecimals?: boolean }) {
  const formatted = value === null ? '—' : fixedDecimals ? formatFixedNumber(value, grouping) : grouping ? formatNumber(value) : formatPlainNumber(value);
  return <div><span>{label}</span><strong>{formatted === '—' ? formatted : `${formatted}${suffix}`}</strong></div>;
}

function EmptyState() {
  return <div className="empty-state">조건에 맞는 결과가 없습니다.</div>;
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return <main className="status-screen"><div>{children}</div></main>;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}

function scoreTrackCategory(row: Pick<ScoreRow, 'u' | 'd' | 't'>): TrackCategory {
  const department = normalize(row.d);
  const sourceTrack = normalize(row.t);
  if (/(?:간호|임상병리|물리치료|작업치료|치위생|방사선학|응급구조|재활치료|언어치료|청각재활)/.test(department)) return '자연';
  if (/(?:의예|치의예|치의학|한의예|한의학|약학|제약학|수의예|수의학|의과대학)/.test(department) || /^(?:의학과|의학부)$/.test(department)) return '의약학';
  if (/(?:예체능|미술|디자인|음악|성악|작곡|피아노|관현악|무용|체육|스포츠|연극|영화|공연|조형|회화|공예|사진|웹툰|만화|애니메이션|뷰티|패션|실용음악|골프|태권도|경호|레저)/.test(department)) return '예체능';
  if (sourceTrack === '인문' || sourceTrack === '자연') return sourceTrack;
  if (sourceTrack === '예체능' || sourceTrack === '의약학') return sourceTrack;
  if (/(?:자연|공학|과학|수학|통계|물리|화학|생명|환경|컴퓨터|소프트웨어|ai|인공지능|데이터|반도체|전자|기계|건축|토목|항공|산업|식품|에너지|스마트|첨단|it|ict)/.test(department)) return '자연';
  if (/(?:공과대|과학기술대|과학기술원)/.test(normalize(row.u))) return '자연';
  return '인문';
}

function methodTrackCategories(row: Pick<MethodView, 'trackName' | 'departmentTrack'>): TrackCategory[] {
  if (row.departmentTrack) return [row.departmentTrack];
  const text = normalize(row.trackName);
  const isAll = /(?:전모집단위|전체모집단위|공통계열|통합계열)/.test(text);
  if (isAll) {
    return TRACK_CATEGORIES.filter((track) => {
      if (track === '의약학' && /(?:의예|의약학|의학)과?제외/.test(text)) return false;
      if (track === '예체능' && /예체능(?:계열)?제외/.test(text)) return false;
      return true;
    });
  }
  const categories: TrackCategory[] = [];
  if (/(?:인문|사회|경영|상경|어문|문과|언어중심)/.test(text)) categories.push('인문');
  if (/(?:자연|공학|이과|수리중심|과학|ai|소프트웨어|컴퓨터|데이터|반도체|간호|임상병리|물리치료|작업치료|치위생|방사선학|응급구조|재활치료|언어치료|청각재활)/.test(text)) categories.push('자연');
  if (/(?:예체능|미술|음악|체육|스포츠|디자인|연극|영화|공연|무용)/.test(text)) categories.push('예체능');
  if (/(?:의예|의약학|치의예|치의학|한의예|한의학|약학|제약학|수의예|수의학|의과대학)/.test(text) && !/(?:의예|의약학|의학)과?제외/.test(text)) categories.push('의약학');
  return categories.length ? [...new Set(categories)] : ['인문'];
}

function isGeneralScoreRow(row: ScoreRow) {
  return !SPECIAL_ADMISSION_PATTERN.test(`${row.exam ?? ''} ${row.a ?? ''}`);
}

function isGeneralMethodRow(row: MethodView) {
  return !SPECIAL_ADMISSION_PATTERN.test(`${row.examName} ${row.selectionDetail}`);
}

function cleanTrackName(value: string) {
  return value
    .replace(/^[\s,.;:|/\\]+/, '')
    .replace(/[\s,.;:|/\\]+$/, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function regionOptions(values: string[]) {
  const preferred = ['주요서울', '서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남', '광주', '전북', '전남', '대구', '경북', '부산', '울산', '경남', '제주'];
  const order = new Map(preferred.map((region, index) => [region, index]));
  return unique(values).sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b, 'ko'));
}

function buildProfileAnalysis(rows: MethodView[], region: string, university: string) {
  const title = university !== '전체' ? `${university} 2027 정시` : region !== '전체' ? `${region} 2027 정시` : '전국 2027 정시';
  const domainOrder = ['국어', '수학', '영어', '탐구'];
  const domainCounts = new Map(domainOrder.map((domain) => [domain, 0]));
  rows.forEach((row) => highestRatioDomains(row.ratios).split('/').filter(Boolean).forEach((domain) => domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)));
  const topDomains = [...domainCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || domainOrder.indexOf(left[0]) - domainOrder.indexOf(right[0]))
    .slice(0, 2)
    .map(([domain]) => domain);
  const inOrder = (items: string[], order: string[]) => {
    const available = new Set(items.filter(Boolean));
    return order.filter((item) => available.has(item)).join(', ') || '—';
  };
  return {
    title,
    items: [
      { label: '모집군', value: inOrder(rows.flatMap((row) => atomicAdmissionGroups(row.admissionGroup)), ['가군', '나군', '다군', '군외']) },
      { label: '상위 반영영역', value: topDomains.join(', ') || '—' },
      { label: '활용지표', value: inOrder(rows.flatMap((row) => row.metrics), ['백분위', '등급', '표준점수', '변환표준점수']) },
      { label: '영어', value: inOrder(rows.map((row) => row.englishMethod), ['등급 환산', '가산점', '감점', '미반영']) },
      { label: '한국사', value: inOrder(rows.map((row) => String(row.ratios.history || '')), ['가점', '감점', '등급 환산', '미반영']) },
      { label: '학생부', value: inOrder(rows.map((row) => studentRecordEvaluation(row).mode), ['정성평가', '정량평가', '미반영', '미기재']) },
    ],
  };
}

function regularAdmissionChanges(rows: ChangeRow[]) {
  return rows
    .filter((row) => REGULAR_CHANGE_IDS.has(row.id))
    .map((row) => ({ ...row, ...REGULAR_CHANGE_REWRITES[row.id] }));
}

function normalizedEnglishMethod(value: string) {
  return value === '환산' ? '등급 환산' : value;
}

function normalizedHistoryMethod(value: string, officialMethod?: string) {
  if (['가점', '감점', '가감점', '등급 환산', '미반영'].includes(value)) return value;
  if (/^\d+(?:\.\d+)?%$/.test(value) || value === '선택 반영') return '등급 환산';
  return officialMethod && ['가점', '감점', '등급 환산', '미반영'].includes(officialMethod) ? officialMethod : '미반영';
}

function expandProfileMethods(profile: ProfileView): MethodView[] {
  const bracketPattern = /\[([^\]]+)\]\s*([\s\S]*?)(?=\[[^\]]+\]|$)/g;
  const bracketed = [...profile.selection.matchAll(bracketPattern)].map((match) => ({
    name: match[1].trim(),
    body: match[2].trim(),
  }));
  const segments = bracketed.length ? bracketed : [{ name: '일반전형', body: profile.selection }];
  const formulas = extractFormulaRows(profile);

  return segments.flatMap((segment, segmentIndex) => {
    const groups = unique([
      ...[...segment.body.matchAll(/([가나다])군/g)].map((match) => `${match[1]}군`),
      ...formulas.flatMap((formula) => formula.groupHint ? atomicAdmissionGroups(formula.groupHint) : []),
    ]);
    const admissionGroups = groups.length ? groups : ['군외'];
    const matchedFormulas = formulas.filter((formula) => !formula.examHint || normalize(formula.examHint) === normalize(segment.name));
    const segmentFormulas = matchedFormulas.length ? matchedFormulas : formulas.filter((formula) => !formula.examHint);
    const formulasForSegment = segmentFormulas.length ? segmentFormulas : formulas;
    return admissionGroups.flatMap((admissionGroup) => {
      const groupSelection = selectionForGroup(segment.body, admissionGroup);
      const record = studentRecordForMethod(groupSelection, profile);
      const groupFormulas = formulasForSegment.filter((formula) => !formula.groupHint || atomicAdmissionGroups(formula.groupHint).includes(admissionGroup));
      const hasGroupScopedFormula = formulasForSegment.some((formula) => formula.groupHint);
      const applicableFormulas = groupFormulas.length ? groupFormulas : hasGroupScopedFormula ? [] : formulasForSegment;
      return applicableFormulas.map((formula) => ({
        ...profile,
        ...(formula.sbOverride === undefined
          ? record
          : { sb: formula.sbOverride, sbDetail: formula.sbDetailOverride ?? (formula.sbOverride ? '반영' : '미반영') }),
        rowId: `${profile.id}-${segmentIndex}-${admissionGroup}-${formula.formulaId}`,
        admissionGroup,
        examName: formula.examNameOverride ?? segment.name,
        trackName: cleanTrackName(contextualTrackName(profile, segment.name, formula.trackName)),
        ratios: { ...formula.ratios, history: normalizedHistoryMethod(formula.ratios.history, profile.historyMethod) },
        weights: formula.weights,
        domainCount: formula.domainCount,
        englishMethod: normalizedEnglishMethod(formula.englishMethod),
        bonusDetail: formula.bonusDetail ?? bonusDetailForProfile(profile),
        metrics: formula.metricsOverride ?? profile.metrics,
        ratioLabels: formula.ratioLabels,
        weightLabels: formula.weightLabels,
        selectionDetail: groupSelection,
      }));
    });
  });
}

function contextualTrackName(profile: ProfileView, examName: string, trackName: string) {
  const isFreeMajorChoice = /일반학생\s*Ⅱ\s*자유전공\s*\(A\)와\s*\(B\).*높은\s*점수\s*반영/.test(profile.ratio);
  if (!isFreeMajorChoice || !/일반학생\s*2/.test(examName)) return trackName;
  const type = trackName.match(/유형\s*([A-C])/i)?.[1]?.toUpperCase();
  return type ? `자유전공 (유형 ${type})` : '자유전공';
}

function mergeEquivalentAdmissionGroups(rows: MethodView[]) {
  const merged = new Map<string, { row: MethodView; groups: string[] }>();

  rows.forEach((row) => {
    const groups = atomicAdmissionGroups(row.admissionGroup);
    const isRegularGroup = groups.every((group) => /^[가나다]군$/.test(group));
    if (!isRegularGroup) {
      merged.set(`single:${row.rowId}`, { row, groups });
      return;
    }

    const sharedSelection = stripAdmissionGroupPrefix(row.selectionDetail);
    const key = JSON.stringify([
      row.id,
      row.examName,
      row.trackName,
      row.englishMethod,
      row.bonusDetail,
      row.ratios.korean,
      row.ratios.math,
      row.ratios.english,
      row.ratios.inquiry,
      row.ratios.history,
      row.ratioLabels?.korean,
      row.ratioLabels?.math,
      row.ratioLabels?.english,
      row.ratioLabels?.inquiry,
      row.weightLabels?.korean,
      row.weightLabels?.math,
      row.weightLabels?.english,
      row.weightLabels?.inquiry,
      row.domainCount,
      row.conversionMax,
      recordLabel(row),
      [...row.metrics].sort(),
      normalize(sharedSelection),
    ]);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { row, groups: [...groups] });
      return;
    }
    groups.forEach((group) => {
      if (!existing.groups.includes(group)) existing.groups.push(group);
    });
  });

  return [...merged.values()].map(({ row, groups }) => {
    const admissionGroup = combinedAdmissionGroup(groups);
    if (admissionGroup === row.admissionGroup) return row;
    return {
      ...row,
      rowId: `${row.rowId}-${admissionGroup}`,
      admissionGroup,
      selectionDetail: stripAdmissionGroupPrefix(row.selectionDetail),
    };
  });
}

function atomicAdmissionGroups(value: string) {
  if (value === '군외') return ['군외'];
  const letters = [...value.matchAll(/[가나다]/g)].map((match) => `${match[0]}군`);
  return letters.length ? [...new Set(letters)] : [value];
}

function combinedAdmissionGroup(groups: string[]) {
  const order = ['가군', '나군', '다군'];
  const sorted = [...new Set(groups)].sort((left, right) => order.indexOf(left) - order.indexOf(right));
  if (sorted.length <= 1) return sorted[0] ?? '군외';
  return `${sorted.map((group) => group[0]).join('')}군`;
}

function stripAdmissionGroupPrefix(value: string) {
  return value.replace(/^[가나다](?:군)?(?:\([^)]*\))?\s*/, '').trim();
}

function extractFormulaRows(profile: ProfileView): FormulaRow[] {
  const specialRows = specialFormulaRows(profile);
  if (specialRows) return specialRows;

  const raw = `${profile.ratio} ${profile.metric}`;
  const cleaned = raw
    .replace(/[가-힣A-Za-z]+\d+/g, (word) => word.replace(/\d+/g, ''))
    .replace(/\((\d+(?:\.\d+)?)\)/g, ' ')
    .replace(/\s+/g, ' ');
  const matches: { start: number; end: number; ratios: RatioSnapshot; englishMethod: string }[] = [];
  const threeDomain = /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(가산|감점)\s+(\d+(?:\.\d+)?)/g;
  const fourDomain = /(\d+(?:\.\d+)?)\s*(?:,|\+)?\s+(\d+(?:\.\d+)?)\s*(?:,|\+)?\s+(\d+(?:\.\d+)?)\s*(?:,|\+)?\s+(\d+(?:\.\d+)?)/g;

  for (const match of cleaned.matchAll(threeDomain)) {
    const values = [Number(match[1]), Number(match[2]), Number(match[4])];
    if (!validRatioValues(values)) continue;
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      ratios: { korean: values[0], math: values[1], english: null, inquiry: values[2], history: profile.ratios.history },
      englishMethod: match[3] === '가산' ? '가산점' : '감점',
    });
  }
  for (const match of cleaned.matchAll(fourDomain)) {
    const values = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    if (!validRatioValues(values) || matches.some((item) => Math.abs(item.start - match.index) < 4)) continue;
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      ratios: { korean: values[0], math: values[1], english: values[2], inquiry: values[3], history: profile.ratios.history },
      englishMethod: '등급 환산',
    });
  }

  matches.sort((left, right) => left.start - right.start);
  if (!matches.length) {
    return [{
      formulaId: 0,
      trackName: '전체',
      groupHint: null,
      ratios: profile.ratios,
      weights: profile.weights,
      domainCount: profile.domainCount,
      englishMethod: englishReflectionMethod(profile),
      bonusDetail: bonusDetailForProfile(profile),
    }];
  }

  let previousEnd = 0;
  let currentGroup: string | null = null;
  return matches.map((match, index) => {
    const ratios = match.ratios;
    let trackName = formulaTrackName(cleaned.slice(previousEnd, match.start), index);
    const groupMatch = trackName.match(/^([가나다])(?:군|\s)/);
    if (groupMatch) {
      currentGroup = `${groupMatch[1]}군`;
      trackName = trackName.replace(/^[가나다](?:군)?\s*/, '').trim() || `계열 ${index + 1}`;
    }
    previousEnd = match.end;
    return {
      formulaId: index,
      trackName,
      groupHint: currentGroup,
      ratios,
      weights: practicalWeights(ratios),
      domainCount: reflectedDomainCount(ratios),
      englishMethod: match.englishMethod,
      bonusDetail: bonusDetailForProfile(profile, cleaned.slice(match.end, matches[index + 1]?.start ?? cleaned.length)),
    };
  });
}

function specialFormulaRows(profile: ProfileView): FormulaRow[] | null {
  const fixed = (
    formulaId: number,
    trackName: string,
    groupHint: string | null,
    ratios: RatioSnapshot,
    options: Partial<FormulaRow> = {},
  ): FormulaRow => {
    const domainCount = options.domainCount ?? reflectedDomainCount(ratios);
    const denominator = domainCount ? 100 / domainCount : 0;
    const weights = Object.fromEntries(
      (['korean', 'math', 'english', 'inquiry'] as DomainKey[]).map((key) => [key, ratios[key] === null || !denominator ? null : ratios[key] / denominator]),
    ) as WeightSnapshot;
    return {
      formulaId,
      trackName,
      groupHint,
      ratios,
      weights,
      domainCount,
      englishMethod: '등급 환산',
      bonusDetail: '없음',
      ...options,
    };
  };

  const flexible = (
    formulaId: number,
    trackName: string,
    groupHint: string | null,
    domainCount: number,
    ratioLabel: string,
    options: Partial<FormulaRow> = {},
  ): FormulaRow => ({
    formulaId,
    trackName,
    groupHint,
    ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' },
    weights: { korean: null, math: null, english: null, inquiry: null },
    domainCount,
    englishMethod: '등급 환산',
    bonusDetail: '없음',
    ratioLabels: { korean: ratioLabel, math: ratioLabel, english: ratioLabel, inquiry: ratioLabel },
    weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' },
    ...options,
  });

  if (profile.u === '강원대(강릉원주대)') {
    return [
      flexible(0, '일반학과', '나다군', 3, '상위 33.33%', {
        ratios: { korean: null, math: null, english: null, inquiry: null, history: '가감점' },
        englishMethod: '등급 환산',
        bonusDetail: '국어, 수학, 영어, 탐구 가운데 상위 3개 영역 반영, 탐구 상위 1과목',
        metricsOverride: ['백분위', '등급'],
      }),
      flexible(1, '수산생명의학과, 간호학과', '다군', 3, '상위 33.33%', {
        ratios: { korean: null, math: null, english: null, inquiry: null, history: '가감점' },
        englishMethod: '등급 환산',
        bonusDetail: '미적분 또는 기하 반영 시 수학 10%, 과탐 반영 시 탐구 10% 가점',
        metricsOverride: ['백분위', '등급'],
      }),
      fixed(2, '치의예과', '다군', { korean: 20, math: 35, english: 20, inquiry: 25, history: '가점' }, {
        englishMethod: '등급 환산',
        bonusDetail: '과탐 2과목 평균 반영',
        metricsOverride: ['백분위', '등급'],
      }),
    ];
  }

  if (profile.u === '아신대') {
    const nonExamRow = (formulaId: number, examHint: string, trackName: string): FormulaRow => ({
      formulaId,
      examHint,
      trackName,
      groupHint: '나군',
      ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' },
      weights: { korean: null, math: null, english: null, inquiry: null },
      domainCount: 0,
      englishMethod: '미반영',
      bonusDetail: '없음',
      metricsOverride: ['등급'],
    });
    return [
      nonExamRow(0, '일반전형', '기독교교육과, 미디어학과, 기독교상담학과, 사회복지선교학과'),
      nonExamRow(1, '기독학생', '신학과'),
      nonExamRow(2, '성인학습자', '신학과'),
      nonExamRow(3, '기회균형선발', '전 모집단위'),
      nonExamRow(4, '재외국민과 외국인', '전 모집단위'),
    ];
  }
  if (profile.u === '동양대') {
    return [fixed(0, '인문계열, 자연계열', null, { korean: null, math: null, english: null, inquiry: 30, history: '가점' }, {
      domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'],
      ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)', inquiry: '30%' },
      weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' },
    })];
  }
  if (profile.u === '서경대') {
    return [fixed(0, '전 모집단위', null, { korean: null, math: null, english: 20, inquiry: null, history: '가점' }, {
      domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'],
      ratioLabels: { korean: '(40%)', math: '(40%)', inquiry: '(40%)' },
      weightLabels: { korean: '1.20배', math: '1.20배', english: '0.60배', inquiry: '1.20배' },
    })];
  }
  if (profile.u === '강남대') {
    const ordered = '상위 40%, 차순위 20%';
    const orderedWeights = '0.80배, 0.40배';
    const flexibleOptions: Partial<FormulaRow> = {
      ratios: { korean: null, math: null, english: null, inquiry: null, history: '등급 환산' },
      weightLabels: { korean: orderedWeights, math: orderedWeights, english: orderedWeights, inquiry: orderedWeights },
      englishMethod: '등급 환산',
      metricsOverride: ['백분위', '등급'],
    };
    return [
      fixed(0, '인문사회계열', null, { korean: 35, math: 25, english: 20, inquiry: 20, history: '등급 환산' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      flexible(1, '예체능계열', null, 2, ordered, flexibleOptions),
      fixed(2, '공학계열', null, { korean: 25, math: 35, english: 20, inquiry: 20, history: '등급 환산' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 7% 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(3, '자유전공학부', null, 2, ordered, {
        ...flexibleOptions,
        bonusDetail: '미적분 또는 기하가 상위 영역이고 수학이 국어 이상일 때 7% 가점',
      }),
    ];
  }
  if (profile.u === '수원대') {
    const ordered = '상위 30%, 차순위 25%, 셋째 15%';
    const orderedWeights = '0.90배, 0.75배, 0.45배';
    return [
      fixed(0, '인문계열', null, { korean: 30, math: null, english: null, inquiry: null, history: '가점' }, { examNameOverride: '일반전형1', domainCount: 4, englishMethod: '등급 환산', ratioLabels: { math: ordered, english: ordered, inquiry: ordered }, weightLabels: { korean: '1.20배', math: orderedWeights, english: orderedWeights, inquiry: orderedWeights }, metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연계열', null, { korean: null, math: 30, english: null, inquiry: null, history: '가점' }, { examNameOverride: '일반전형1', domainCount: 4, englishMethod: '등급 환산', ratioLabels: { korean: ordered, english: ordered, inquiry: ordered }, weightLabels: { korean: orderedWeights, math: '1.20배', english: orderedWeights, inquiry: orderedWeights }, bonusDetail: '미적분 또는 기하 10% 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(2, '전 모집단위', null, 3, '상위 45%, 차순위 35%, 셋째 20%', { examNameOverride: '일반전형2', ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, weightLabels: { korean: '1.35배, 1.05배, 0.60배', math: '1.35배, 1.05배, 0.60배', english: '1.35배, 1.05배, 0.60배', inquiry: '1.35배, 1.05배, 0.60배' }, bonusDetail: '자연계열 미적분 또는 기하 10% 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '중부대' || profile.u === '협성대') {
    return [fixed(0, '인문계열, 자연계열', null, { korean: null, math: null, english: null, inquiry: 30, history: '미반영' }, {
      domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'],
      ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)', inquiry: '30%' },
      weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' },
    })];
  }
  if (profile.u === '평택대') {
    const ordered = '상위 35%, 차순위 35%, 셋째 30%';
    return [flexible(0, '전 모집단위', null, 3, ordered, { ratios: { korean: null, math: null, english: null, inquiry: null, history: '선택 반영' }, weightLabels: { korean: '1.05배, 1.05배, 0.90배', math: '1.05배, 1.05배, 0.90배', english: '1.05배, 1.05배, 0.90배', inquiry: '1.05배, 1.05배, 0.90배' }, metricsOverride: ['등급'] })];
  }
  if (profile.u === '서울교대') {
    return [fixed(0, '초등교육과', '나군', { korean: 33.3, math: 33.3, english: null, inquiry: 33.3, history: '미반영' }, { englishMethod: '미반영', bonusDetail: '영어 3등급, 한국사 4등급 이내', metricsOverride: ['표준점수'] })];
  }
  if (profile.u === 'DGIST') {
    return [fixed(0, '기초학부', null, { korean: 33.3, math: 33.3, english: null, inquiry: 33.3, history: '등급 환산' }, { englishMethod: '등급 환산', bonusDetail: '과탐Ⅱ 5% 가점, 동일 분야 Ⅰ+Ⅱ 조합 불가', metricsOverride: ['표준점수', '변환표준점수', '등급'] })];
  }
  if (profile.u === '가톨릭꽃동네대') {
    return [fixed(0, '전 모집단위', null, { korean: 30, math: 30, english: 20, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '감신대') {
    return [fixed(0, '신학부', null, { korean: 40, math: null, english: 40, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '건양대') {
    return [
      fixed(0, '의학과', null, { korean: 20, math: 30, english: 20, inquiry: 30, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'], examNameOverride: '일반전형, 지역전형' }),
      flexible(1, '데이터의학과, 간호대학, 의과학계열', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
      flexible(2, '의료공과계열, AI SW융합대학, 국방산학융합원, 국방바이오연구원, 사회과학학술원', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
      flexible(3, '군사학과', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '경남대') {
    return [
      flexible(0, '군사학과', '가군', 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
      flexible(1, '전 모집단위', '나다군', 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '경성대') {
    return [fixed(0, '약학과', null, { korean: 25, math: 30, english: 20, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '과탐Ⅱ 과목당 2점 가점', metricsOverride: ['표준점수', '등급'] })];
  }
  if (profile.u === '경일대') {
    return [
      flexible(0, '전 모집단위 (간호학과 제외)', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '과탐 5%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '간호학과', '가군', { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '과탐 5%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '계명대') {
    return [
      fixed(0, '인문사회계열, 패션마케팅학과, 실버스포츠복지학과, 스포츠마케팅학과', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연공학계열 (의예과, 약학부 제외), 자율전공부', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '과탐 5%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '의예과, 약학부', null, { korean: 25, math: 30, english: 20, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하, 과탐 2과목 필수, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '예체능계열', null, { korean: null, math: null, english: 30, inquiry: 30, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '0.90배', inquiry: '0.90배' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '국립경국대') {
    return [flexible(0, '전 모집단위', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '국립군산대') {
    return [
      fixed(0, '미술학과, 산업디자인학과', '가군', { korean: null, math: null, english: 40, inquiry: 20, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '인문사회계열, 해양경찰학과', '다군', { korean: 30, math: 20, english: 30, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '해양경찰학과 과탐 1과목 5%, 2과목 10%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '자연과학계열, 공학계열 (해양경찰학과 제외)', '다군', { korean: 20, math: 30, english: 30, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '과탐 1과목 5%, 2과목 10%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '자율전공학부', '다군', { korean: 25, math: 25, english: 30, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '국립금오공대') {
    return [
      flexible(0, '공학계열, 인문사회계열, 자율전공학부, 첨단융합대학자율전공학부', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '공학계열, 자율전공학부, 첨단융합대학자율전공학부 미적분 또는 기하 15%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(1, '미래융합대학자율전공학부', null, 3, '상위 45%, 차순위 35%, 셋째 20%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, weightLabels: { korean: '1.35배, 1.05배, 0.60배', math: '1.35배, 1.05배, 0.60배', english: '1.35배, 1.05배, 0.60배', inquiry: '1.35배, 1.05배, 0.60배' }, bonusDetail: '미적분 또는 기하 15%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '국립목포대') {
    return [
      fixed(0, '인문계열, 예체능계열', null, { korean: 40, math: null, english: 30, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { math: '(30%)', inquiry: '(30%)' }, weightLabels: { korean: '1.20배', math: '0.90배', english: '0.90배', inquiry: '0.90배' }, metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연계열 (약학과 제외)', null, { korean: null, math: 40, english: 30, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(30%)', inquiry: '(30%)' }, weightLabels: { korean: '0.90배', math: '1.20배', english: '0.90배', inquiry: '0.90배' }, bonusDetail: '미적분 또는 기하 10%, 과탐 5% 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '약학과', null, { korean: null, math: 40, english: null, inquiry: 30, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(30%)', english: '(30%)' }, weightLabels: { korean: '0.90배', math: '1.20배', english: '0.90배', inquiry: '0.90배' }, bonusDetail: '미적분 또는 기하 10%, 과탐 5% 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '국립목포해양대') {
    return [
      fixed(0, '항해학부, 항해정보시스템학부, 기관시스템공학부, 해양경찰학부, 해양메카트로닉스학부, 해군사관학부, 컴퓨터공학과, 조선해양공학과, 해양건설공학과, 첨단해양모빌리티학과', null, { korean: 20, math: 30, english: 30, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '해상운송학부', null, { korean: 20, math: 20, english: 40, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '환경생명공학과', null, { korean: 20, math: 20, english: 30, inquiry: 30, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '해양스포츠학과', null, { korean: 30, math: 20, english: 20, inquiry: 30, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '국립순천대') {
    return [
      fixed(0, '생명산업과학분야', null, { korean: null, math: null, english: 33.33, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(33.33%)', math: '(33.33%)', inquiry: '(33.33%)' }, weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' }, bonusDetail: '미적분 또는 기하 5점, 과탐 5점 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '인문사회계열, 예체능계열', null, { korean: 33.33, math: null, english: 33.33, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { math: '(33.33%)', inquiry: '(33.33%)' }, weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' }, bonusDetail: '미적분 또는 기하 5점 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '자연계열 (약학과 제외)', null, { korean: null, math: 33.33, english: 33.33, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(33.33%)', inquiry: '(33.33%)' }, weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' }, bonusDetail: '미적분 또는 기하 5점, 과탐 5점 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '약학과', null, { korean: null, math: 33.33, english: null, inquiry: 33.33, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(33.33%)', english: '(33.33%)' }, weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' }, metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '국립창원대') {
    return [
      fixed(0, '인문사회계열', null, { korean: 30, math: 25, english: 20, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연계열', null, { korean: 25, math: 30, english: 20, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '사림아너스학부', null, { korean: 30, math: 30, english: 20, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '체육학과, 산업디자인학과', null, { korean: 35, math: null, english: 30, inquiry: 35, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '국립한국해양대') {
    return [
      fixed(0, '자연계열', null, { korean: 22.5, math: 32.5, english: 25, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '해사대학 미적분 10%, 해양과학기술대학과 해양공과대학 미적분 20%, 과탐 2과목 10%, 한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
      fixed(1, '인문사회계열', null, { korean: 32.5, math: 22.5, english: 25, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
      fixed(2, '예체능계열', null, { korean: 37.5, math: null, english: 25, inquiry: 37.5, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '나사렛대') {
    return [fixed(0, '전 모집단위', null, { korean: null, math: null, english: null, inquiry: 20, history: '미반영' }, {
      domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)', english: '(40%)' },
      weightLabels: { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' }, bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['백분위', '등급'],
    })];
  }
  if (profile.u === '남부대') {
    return [
      fixed(0, '전 모집단위 (간호학과, 방사선학과 제외)', null, { korean: 30, math: 30, english: 25, inquiry: 10, history: '등급 환산' }, { domainCount: 5, englishMethod: '등급 환산', sbOverride: true, sbDetailOverride: '학생부 40%', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '간호학과, 방사선학과', null, { korean: 30, math: 30, english: 30, inquiry: 5, history: '등급 환산' }, { domainCount: 5, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '남서울대') {
    return [flexible(0, '전 모집단위', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '대구가톨릭대') {
    const ordered = '상위 40%, 차순위 35%, 셋째 25%';
    return [
      flexible(0, '전 모집단위 (의예과, 약학부, 간호학과, 체육교육과 제외)', null, 3, ordered, { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, weightLabels: { korean: '1.20배, 1.05배, 0.75배', math: '1.20배, 1.05배, 0.75배', english: '1.20배, 1.05배, 0.75배', inquiry: '1.20배, 1.05배, 0.75배' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '의예과, 약학부', null, { korean: 30, math: 30, english: 10, inquiry: 30, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하, 과탐 2과목 필수, 한국사 등급별 가점', metricsOverride: ['표준점수', '변환표준점수', '등급'] }),
      fixed(2, '간호학과', null, { korean: 30, math: 30, english: 20, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '체육교육과', null, { korean: 35, math: 15, english: 20, inquiry: 30, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '대구한의대') {
    return [
      fixed(0, '한의예과(자연)', '나군', { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하, 과탐 2과목 필수, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '한의예과(인문)', '나군', { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '확률과 통계, 사탐 2과목 필수, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '전 모집단위 (한의예과 제외)', null, { korean: 30, math: 30, english: 20, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '동서대') {
    return [
      fixed(0, '전 모집단위', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { examNameOverride: '일반전형', englishMethod: '등급 환산', metricsOverride: ['표준점수', '등급'] }),
      flexible(1, '실기 모집단위', null, 3, '상위 33.33%', { examNameOverride: '실기전형', ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '동아대') {
    return [
      fixed(0, '인문계열, 자연계열, 광역계열, 의예과, 간호학과', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '자연계열, 간호학과, 에너지테크, 휴먼케어 미적분 또는 기하 3%, 의예과 과탐 5%, 한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
      flexible(1, '예체능계열', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: 33.33, inquiry: null, history: '가점' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '동의대') {
    return [
      fixed(0, '인문사회과학대학, 상경대학, 예술디자인체육대학, 동의지천융합대학', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['표준점수', '등급'] }),
      fixed(1, '의료보건생활대학, 공과대학, 소프트웨어융합대학', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 표준점수 10% 가점, 한국사 응시 필수', metricsOverride: ['표준점수', '등급'] }),
      fixed(2, '한의예과', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '탐구 변환표준점수, 한국사 응시 필수', metricsOverride: ['표준점수', '변환표준점수', '등급'] }),
    ];
  }
  if (profile.u === '루터대') {
    return [fixed(0, '전 모집단위', null, { korean: 20, math: null, english: 40, inquiry: 40, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['등급'] })];
  }
  if (profile.u === '목원대') {
    const ordered = '상위 60%, 차순위 40%';
    return [flexible(0, '전 모집단위', null, 2, ordered, { ratios: { korean: null, math: null, english: null, inquiry: null, history: '선택 반영' }, weightLabels: { korean: '1.20배, 0.80배', math: '1.20배, 0.80배', english: '1.20배, 0.80배', inquiry: '1.20배, 0.80배' }, metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '배재대') {
    return [flexible(0, '전 모집단위', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '백석대') {
    return [fixed(0, '전 모집단위', null, { korean: null, math: null, english: null, inquiry: 20, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)', english: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' }, metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '부산가톨릭대') {
    return [fixed(0, '전 모집단위', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['표준점수', '등급'] })];
  }
  if (profile.u === '부산외대') {
    return [fixed(0, '전 모집단위', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['표준점수', '등급'] })];
  }
  if (profile.u === '상지대') {
    return [
      flexible(0, '전 모집단위 (한의예과, 간호학과 제외)', null, 2, '상위 80%, 차순위 20%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, weightLabels: { korean: '1.60배, 0.40배', math: '1.60배, 0.40배', english: '1.60배, 0.40배', inquiry: '1.60배, 0.40배' }, bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 교과 20%', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '한의예과', null, { korean: 20, math: 40, english: 20, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '간호학과', null, { korean: 25, math: 35, english: 20, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '서울신학대') {
    return [fixed(0, '전 모집단위', null, { korean: null, math: null, english: 20, inquiry: null, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)', inquiry: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '0.60배', inquiry: '1.20배' }, bonusDetail: 'IT융합학부 수학 10%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '서울한영대') {
    return [fixed(0, '전 모집단위', null, { korean: 30, math: null, english: 30, inquiry: 20, history: '등급 환산' }, { domainCount: 4, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '서원대') {
    return [flexible(0, '전 모집단위', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '선문대') {
    return [
      flexible(0, '전 계열 (보건계열 제외)', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['등급'] }),
      flexible(1, '간호학과, 물리치료학과, 치위생학과, 응급구조학과', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '세명대') {
    return [
      fixed(0, '전 모집단위 (간호학과, 임상병리학과, 한의예과 제외)', null, { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, { domainCount: 2, englishMethod: '미반영', ratioLabels: { korean: '(50%)', math: '(50%)', inquiry: '(50%)' }, weightLabels: { korean: '1.00배', math: '1.00배', inquiry: '1.00배' }, metricsOverride: ['백분위'] }),
      fixed(1, '간호학과, 임상병리학과', null, { korean: null, math: null, english: 20, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)', inquiry: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '0.60배', inquiry: '1.20배' }, metricsOverride: ['백분위', '등급'] }),
      fixed(2, '한의예과', null, { korean: 30, math: 30, english: 10, inquiry: 30, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 5%, 과탐 2과목 평균 5% 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '송원대') {
    return [
      fixed(0, '가군 모집단위', '가군', { korean: 40, math: 30, english: 25, inquiry: null, history: '등급 환산' }, { domainCount: 4, englishMethod: '등급 환산', metricsOverride: ['등급'] }),
      fixed(1, '나군 모집단위', '나군', { korean: 30, math: 20, english: 20, inquiry: 25, history: '등급 환산' }, { domainCount: 5, englishMethod: '등급 환산', metricsOverride: ['등급'] }),
    ];
  }
  if (profile.u === '순천향대') {
    return [
      fixed(0, '의예과, 간호학과', '다군', { korean: 20, math: 30, english: 30, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 10%, 과탐 2과목 각각 10% 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '전 모집단위 (의예과, 간호학과 제외)', null, { korean: null, math: null, english: null, inquiry: 20, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)', english: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' }, bonusDetail: '자연계열 지정 모집단위 미적분 또는 기하 10% 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '신경주대') {
    return [
      fixed(0, '인문사회, 예체능계열', '가군', { korean: 40, math: 30, english: 30, inquiry: null, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연과학, 공학계열', '가군', { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '신라대') {
    return [
      fixed(0, '전 모집단위', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { examNameOverride: '일반학생전형', englishMethod: '등급 환산', metricsOverride: ['표준점수', '등급'] }),
      flexible(1, '체육학부', '나군', 3, '상위 33.33%', { examNameOverride: '일반학생전형', ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '영남대') {
    return [
      fixed(0, '인문사회계열', null, { korean: 30, math: 25, english: 25, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연계열', null, { korean: 20, math: 30, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 5%, 과탐 2과목 5%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '의예과, 약학부', null, { korean: 25, math: 35, english: 10, inquiry: 30, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '도시공학과, 원예생명과학과, 조경학과, 산림자원학과, 식품공학과, 주거환경학과, 의류패션학과, 휴먼서비스학과, 전공자유선택학부', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(4, '체육학부, 산업디자인학과, 생활제품디자인학과', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '영산대') {
    return [
      fixed(0, '인문사회계열, 자연공학계열', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 30%', metricsOverride: ['표준점수', '등급'] }),
      flexible(1, '예체능계열', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 30%', metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '예수대') {
    return [fixed(0, '간호학부', '다군', { korean: 25, math: 35, english: 25, inquiry: 15, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 10%, 과탐 3% 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '우석대') {
    return [
      fixed(0, '간호학과', null, { korean: null, math: null, english: null, inquiry: 30, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '한의예과, 한약학과', null, { korean: 20, math: 30, english: 20, inquiry: 30, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 10%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '약학과', null, { korean: 20, math: 30, english: 20, inquiry: 30, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 필수, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '우송대') {
    return [flexible(0, '전 모집단위', null, 2, '상위 60%, 차순위 40%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, weightLabels: { korean: '1.20배, 0.80배', math: '1.20배, 0.80배', english: '1.20배, 0.80배', inquiry: '1.20배, 0.80배' }, bonusDetail: '간호학과 미적분 또는 기하 5%, 과탐 5% 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '울산대') {
    return [
      fixed(0, '글로벌인문학부, 공공인재학부, 경영경제융합학부, 디자인융합학부, 자율전공학부', null, { korean: 30, math: 20, english: 19, inquiry: 30, history: '등급 환산' }, { domainCount: 5, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연공학계열', null, { korean: 20, math: 30, english: 19, inquiry: 30, history: '등급 환산' }, { domainCount: 5, englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 20%, 과탐 10% 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '간호학과', null, { korean: 20, math: 30, english: 19, inquiry: 30, history: '등급 환산' }, { domainCount: 5, englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 20% 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '의예과', null, { korean: 20, math: 30, english: 19, inquiry: 30, history: '등급 환산' }, { domainCount: 5, englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하, 과탐 2과목 필수', metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '을지대') {
    const optionalThirty: RatioLabels = { korean: '(30%)', inquiry: '(30%)' };
    const optionalThirtyWeights: RatioLabels = { korean: '0.90배', inquiry: '0.90배' };
    return [
      fixed(0, '자연계열 (의예과 제외)', null, { korean: null, math: 40, english: 30, inquiry: null, history: '가점' }, { examNameOverride: '일반전형Ⅰ', domainCount: 3, ratioLabels: optionalThirty, weightLabels: optionalThirtyWeights, bonusDetail: '과탐 1과목 3%, 2과목 5% 가점', sbOverride: true, sbDetailOverride: '학생부 교과 10%', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '인문계열', null, { korean: 30, math: null, english: 40, inquiry: null, history: '가점' }, { examNameOverride: '일반전형Ⅰ', domainCount: 3, ratioLabels: { math: '(30%)', inquiry: '(30%)' }, weightLabels: { math: '0.90배', inquiry: '0.90배' }, sbOverride: true, sbDetailOverride: '학생부 교과 10%', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '의예과', null, { korean: 30, math: 30, english: 10, inquiry: 30, history: '가점' }, { examNameOverride: '일반전형Ⅱ', bonusDetail: '생명과학Ⅰ 또는 Ⅱ 1과목 이상 필수', sbOverride: false, sbDetailOverride: '미반영', metricsOverride: ['백분위', '등급'] }),
      flexible(3, '자연계열 (의예과 제외)', null, 2, '상위 50%', { examNameOverride: '일반전형Ⅱ', bonusDetail: '과탐 1과목 3%, 2과목 5% 가점', sbOverride: false, sbDetailOverride: '미반영', metricsOverride: ['백분위', '등급'] }),
      flexible(4, '인문계열', null, 2, '상위 50%', { examNameOverride: '일반전형Ⅱ', sbOverride: false, sbDetailOverride: '미반영', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '유원대') {
    return [
      flexible(0, '전 모집단위 (간호학과, 물리치료학과 제외)', null, 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
      fixed(1, '간호학과, 물리치료학과', null, { korean: null, math: null, english: 30, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(35%)', math: '(35%)', inquiry: '(35%)' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '0.90배', inquiry: '1.05배' }, metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '인제대') {
    return [
      fixed(0, '전체 모집단위', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['표준점수', '등급'] }),
      fixed(1, '글로컬리더스학부(이공계열)', null, { korean: 10, math: 40, english: 10, inquiry: 40, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['표준점수', '등급'] }),
      flexible(2, '스포츠헬스케어학부, 웹툰영상학과', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '인천가톨릭대') {
    return [
      fixed(0, '간호학과', '다군', { korean: 30, math: 30, english: 20, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 5%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(1, '조형예술학과, 융합디자인학과, 문화콘텐츠학과, 자유전공', '나다군', 2, '상위 50%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '전주대') {
    return [
      fixed(0, '전 모집단위 (수학교육과, 과학교육과 제외)', null, { korean: null, math: null, english: null, inquiry: 20, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', math: '(40%)', english: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '수학교육과, 과학교육과', null, { korean: null, math: 40, english: null, inquiry: 20, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40%)', english: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' }, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '조선대') {
    return [
      fixed(0, '인문계열', null, { korean: 30, math: 25, english: 25, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연계열 (의예과, 치의예과, 약학과 제외)', null, { korean: 25, math: 30, english: 25, inquiry: 20, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '의예과, 치의예과, 약학과', null, { korean: 25, math: 35, english: 25, inquiry: 15, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하, 과탐 2과목 필수, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(3, '예체능계열', null, { korean: 50, math: null, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(4, '통합계열', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(5, '군사학과', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '창신대') {
    return [fixed(0, '전 모집단위', '가군', { korean: 30, math: 30, english: 30, inquiry: 10, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '청운대') {
    return [fixed(0, '일반학과, 학부', '가군', { korean: null, math: null, english: null, inquiry: 20, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(40% 또는 20%)', math: '(40% 또는 20%)', english: '(40% 또는 20%)', inquiry: '(20%)' }, weightLabels: { korean: '1.20배 또는 0.60배', math: '1.20배 또는 0.60배', english: '1.20배 또는 0.60배', inquiry: '0.60배' }, bonusDetail: '미적분 또는 기하 10%, 한국사 응시 여부만 반영', sbOverride: true, sbDetailOverride: '교과 42.22%, 출결 2.22%', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '청주대') {
    return [
      flexible(0, '전체 학과 (항공운항학과, 군사학과 제외)', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, englishMethod: '등급 환산', bonusDetail: '미적분 10%, 자연계 과탐 2과목 응시 시 10점 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '항공운항학과', null, { korean: null, math: 35, english: 40, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 10%, 과탐 2과목 응시 시 10점 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(2, '군사학과', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '초당대') {
    return [
      fixed(0, '항공운항학과', '나군', { korean: null, math: null, english: null, inquiry: 20, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(상위 50%, 차순위 30%)', math: '(상위 50%, 차순위 30%)', english: '(상위 50%, 차순위 30%)' }, weightLabels: { korean: '1.50배, 0.90배', math: '1.50배, 0.90배', english: '1.50배, 0.90배', inquiry: '0.60배' }, bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 40%', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '간호학과', '다군', { korean: null, math: null, english: null, inquiry: 20, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(상위 50%, 차순위 30%)', math: '(상위 50%, 차순위 30%)', english: '(상위 50%, 차순위 30%)' }, weightLabels: { korean: '1.50배, 0.90배', math: '1.50배, 0.90배', english: '1.50배, 0.90배', inquiry: '0.60배' }, bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 40%', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '추계예술대') {
    return [
      fixed(0, '작곡과', null, { korean: 70, math: null, english: 30, inquiry: null, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '미술창작학부', null, { korean: 50, math: null, english: 50, inquiry: null, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '칼빈대') {
    return [
      fixed(0, '신학과, 사회복지학과, 스포츠지도학과', null, { korean: 40, math: null, english: null, inquiry: null, history: '미반영' }, { domainCount: 1, englishMethod: '미반영', sbOverride: true, sbDetailOverride: '학생부 교과 30%, 면접 30%', metricsOverride: ['등급'] }),
      fixed(1, '반려동물산업학과', null, { korean: null, math: null, english: null, inquiry: 40, history: '미반영' }, { domainCount: 1, englishMethod: '미반영', sbOverride: true, sbDetailOverride: '학생부 교과 30%, 면접 30%', metricsOverride: ['등급'] }),
    ];
  }
  if (profile.u === '한국체육대') {
    return [fixed(0, '일반학과', null, { korean: null, math: null, english: null, inquiry: 30, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' }, bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '한동대') {
    return [fixed(0, '전 학부 (자율전공)', '다군', { korean: 35, math: 35, english: 20, inquiry: 10, history: '가점' }, { englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '한서대') {
    return [
      fixed(0, '전 학과 (항공운항학과, 실기고사 학과 제외)', null, { korean: null, math: null, english: null, inquiry: 30, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' }, bonusDetail: '미적분 또는 기하 10%, 한국사 응시 필수', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '항공운항학과', null, { korean: 20, math: 30, english: 30, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 10%, 한국사 응시 필수', metricsOverride: ['백분위', '등급'] }),
      fixed(2, '실기고사 실시학과', null, { korean: null, math: null, english: null, inquiry: 50, history: '미반영' }, { domainCount: 2, englishMethod: '등급 환산', ratioLabels: { korean: '(상위 50%)', math: '(상위 50%)', english: '(상위 50%)' }, weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' }, bonusDetail: '한국사 응시 필수', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '한세대') {
    return [fixed(0, '모든 모집단위', '가다군', { korean: null, math: null, english: 30, inquiry: 30, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(상위 40%)', math: '(상위 40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '0.90배', inquiry: '0.90배' }, bonusDetail: '미적분 또는 기하 5%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '호남대') {
    return [fixed(0, '일반학생A전형', '나군', { korean: 25, math: 25, english: 25, inquiry: 12.5, history: '12.5%' }, { domainCount: 5, englishMethod: '등급 환산', sbOverride: true, sbDetailOverride: '학생부 30%', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '호서대') {
    return [fixed(0, '전 모집단위', '가나다군', { korean: null, math: null, english: null, inquiry: 30, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' }, bonusDetail: '자연과학계열, 공학계열 미적분 또는 기하 5%', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '가톨릭관동대') {
    const fixedRow = (formulaId: number, trackName: string, ratios: RatioSnapshot, bonusDetail = '없음'): FormulaRow => ({
      formulaId,
      examHint: '수능위주전형',
      trackName,
      groupHint: null,
      ratios,
      weights: practicalWeights(ratios),
      domainCount: 4,
      englishMethod: '등급 환산',
      bonusDetail,
      metricsOverride: ['백분위', '등급'],
    });
    const topThreeRatios: RatioSnapshot = { korean: null, math: null, english: null, inquiry: null, history: '가점' };
    const topThreeLabels: RatioLabels = { korean: '(40/30/30%)', math: '(40/30/30%)', english: '(40/30/30%)', inquiry: '(40/30/30%)' };
    const topThreeWeights: RatioLabels = { korean: '1.20, 0.90, 0.90배', math: '1.20, 0.90, 0.90배', english: '1.20, 0.90, 0.90배', inquiry: '1.20, 0.90, 0.90배' };
    const topTwoRatios: RatioSnapshot = { korean: null, math: null, english: null, inquiry: null, history: '가점' };
    const topTwoLabels: RatioLabels = { korean: '상위 50%', math: '상위 50%', english: '상위 50%', inquiry: '상위 50%' };
    const topTwoWeights: RatioLabels = { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' };
    const flexibleRow = (formulaId: number, examHint: string, trackName: string, domainCount: number, ratios: RatioSnapshot, ratioLabels: RatioLabels, weightLabels: RatioLabels): FormulaRow => ({
      formulaId,
      examHint,
      trackName,
      groupHint: null,
      ratios,
      weights: { korean: null, math: null, english: null, inquiry: null },
      domainCount,
      englishMethod: '등급 환산',
      bonusDetail: '없음',
      metricsOverride: ['백분위', '등급'],
      ratioLabels,
      weightLabels,
    });
    return [
      fixedRow(0, '의학과(의예과)', { korean: 20, math: 30, english: 20, inquiry: 30, history: '가점' }, '과탐 2과목 평균 백분위 5% 가중치, 화학Ⅱ 또는 생명과학Ⅱ 포함 시 7%'),
      fixedRow(1, '간호학과', { korean: 20, math: 30, english: 30, inquiry: 20, history: '가점' }, '과탐 2과목 평균 백분위 5% 가중치'),
      flexibleRow(2, '수능위주전형', '헬스케어융합대학, 사범대학', 3, topThreeRatios, topThreeLabels, topThreeWeights),
      flexibleRow(3, '수능위주전형', '트리니티융합대학 전 모집단위 (인문, 자연, 예체능, 통합)', 2, topTwoRatios, topTwoLabels, topTwoWeights),
      flexibleRow(4, '실기전형', '체육교육과, 스포츠레저학전공, 스포츠재활의학전공', 3, topThreeRatios, topThreeLabels, topThreeWeights),
    ];
  }
  if (profile.u === '건국대(글)' || profile.u === '건국대(글로컬)') {
    const topTwoRatios: RatioSnapshot = { korean: null, math: null, english: null, inquiry: null, history: '미반영' };
    const topTwoLabels: RatioLabels = { korean: '(50%)', math: '(50%)', english: '(50%)', inquiry: '(50%)' };
    const topTwoWeights: RatioLabels = { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' };
    const medicalRatios: RatioSnapshot = { korean: 20, math: 30, english: 20, inquiry: 30, history: '미반영' };
    return [
      {
        formulaId: 0,
        trackName: '전 모집단위 (의예과 제외)',
        groupHint: '다군',
        ratios: topTwoRatios,
        weights: { korean: null, math: null, english: null, inquiry: null },
        domainCount: 2,
        englishMethod: '등급 환산',
        bonusDetail: '자연계열 미적분 또는 기하 10%, 과탐 8% 가점, 가산 후 100점 상한',
        metricsOverride: ['백분위', '등급'],
        ratioLabels: topTwoLabels,
        weightLabels: topTwoWeights,
      },
      {
        formulaId: 1,
        trackName: '의예과',
        groupHint: '다군',
        ratios: medicalRatios,
        weights: practicalWeights(medicalRatios),
        domainCount: 4,
        englishMethod: '등급 환산',
        bonusDetail: '없음',
        metricsOverride: ['표준점수', '등급'],
      },
    ];
  }
  if (profile.u === '가톨릭대') {
    const topKoreanMath: RatioLabels = { korean: '상위 35%, 차순위 25%', math: '상위 35%, 차순위 25%' };
    const topKoreanMathWeights: RatioLabels = { korean: '1.40배, 1.00배', math: '1.40배, 1.00배' };
    const freeMajor: RatioLabels = { korean: '(40%)', math: '(40%)', english: '30%', inquiry: '30%' };
    const freeMajorWeights: RatioLabels = { korean: '1.20배', math: '1.20배', english: '0.90배', inquiry: '0.90배' };
    return [
      fixed(0, '전 모집단위 (약학과, 간호학과 제외)', null, { korean: null, math: null, english: 20, inquiry: 20, history: '감점' }, {
        examHint: '일반전형1',
        domainCount: 4,
        englishMethod: '등급 환산',
        metricsOverride: ['백분위', '등급'],
        ratioLabels: topKoreanMath,
        weightLabels: topKoreanMathWeights,
      }),
      fixed(1, '간호학과', null, { korean: 30, math: 40, english: null, inquiry: 30, history: '감점' }, {
        examHint: '일반전형1', englishMethod: '감점', metricsOverride: ['표준점수', '변환표준점수', '등급'],
      }),
      fixed(2, '약학과', null, { korean: 30, math: 40, english: null, inquiry: 30, history: '감점' }, {
        examHint: '일반전형1', englishMethod: '감점', bonusDetail: '과탐 과목당 3% 가점', metricsOverride: ['표준점수', '변환표준점수', '등급'],
      }),
      fixed(3, '자유전공학부 인문사회계열, 자연공학계열', null, { korean: null, math: null, english: 30, inquiry: 30, history: '감점' }, {
        examHint: '일반전형2', domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'], ratioLabels: freeMajor, weightLabels: freeMajorWeights,
      }),
      fixed(4, '의예과', '가군', { korean: 30, math: 40, english: null, inquiry: 30, history: '감점' }, {
        examHint: '일반전형3', englishMethod: '감점', bonusDetail: '과탐 과목당 3% 가점', metricsOverride: ['표준점수', '변환표준점수', '등급'],
      }),
    ];
  }
  if (profile.u === '부산대') {
    return [
      fixed(0, '인문사회계열, 인문자연 통합 모집단위', null, { korean: 30, math: 25, english: 20, inquiry: 25, history: '가점' }),
      fixed(1, '자연계열', null, { korean: 20, math: 30, english: 20, inquiry: 30, history: '가점' }, { bonusDetail: '과탐 2과목 응시 시 5% 가점' }),
      fixed(2, '의예과, 치의예과', null, { korean: 20, math: 30, english: 20, inquiry: 30, history: '가점' }, { bonusDetail: '과탐 2과목 응시 시 5% 가점', sbOverride: true, sbDetailOverride: '학업충실도평가 20%' }),
    ];
  }
  if (profile.u === '성균관대') {
    const ordered = (first: string, second: string): RatioLabels => ({ korean: first, math: second });
    return [
      fixed(0, '자유전공계열, 사회과학계열', '가군', { korean: null, math: null, english: 10, inquiry: 10, history: '감점' }, {
        domainCount: 4, ratioLabels: ordered('상위 45%, 차순위 35%', '상위 45%, 차순위 35%'), weightLabels: { korean: '1.80배, 1.40배', math: '1.80배, 1.40배' }, bonusDetail: '자유전공계열 과탐 5%, 사회과학계열 미적분 3% 가점',
      }),
      fixed(1, '의상학과, 자연과학계열, 반도체시스템공학과, 약학과, 글로벌융합학부', '가군', { korean: 15, math: null, english: 15, inquiry: null, history: '감점' }, {
        domainCount: 4, ratioLabels: { math: '상위 40%, 차순위 30%', inquiry: '상위 40%, 차순위 30%' }, weightLabels: { math: '1.60배, 1.20배', inquiry: '1.60배, 1.20배' }, bonusDetail: '자연계열 모집단위 과탐 5% 가점',
      }),
      fixed(2, '의예과', '가군', { korean: 30, math: 30, english: 20, inquiry: 20, history: '감점' }),
      fixed(3, '경영학과, 영상학과, 공학계열, 소프트웨어학과', '나군', { korean: null, math: null, english: 10, inquiry: 15, history: '감점' }, {
        domainCount: 4, ratioLabels: ordered('상위 45%, 차순위 30%', '상위 45%, 차순위 30%'), weightLabels: { korean: '1.80배, 1.20배', math: '1.80배, 1.20배' }, bonusDetail: '공학계열, 소프트웨어학과 과탐 5%, 경영학과 미적분 3% 가점',
      }),
      fixed(4, '인문과학계열, 글로벌리더학부, 전자전기공학부, 지능형소프트웨어학과', '나군', { korean: null, math: null, english: 20, inquiry: 15, history: '감점' }, {
        domainCount: 4, ratioLabels: ordered('상위 35%, 차순위 30%', '상위 35%, 차순위 30%'), weightLabels: { korean: '1.40배, 1.20배', math: '1.40배, 1.20배' }, bonusDetail: '전자전기공학부, 지능형소프트웨어학과 과탐 5% 가점',
      }),
      fixed(5, '글로벌경제학과, 건설환경공학부, 반도체융합공학과', '다군', { korean: null, math: null, english: 10, inquiry: 10, history: '감점' }, {
        domainCount: 4, ratioLabels: ordered('상위 45%, 차순위 35%', '상위 45%, 차순위 35%'), weightLabels: { korean: '1.80배, 1.40배', math: '1.80배, 1.40배' }, bonusDetail: '건설환경공학부, 반도체융합공학과 과탐 5%, 글로벌경제학과 미적분 3% 가점',
      }),
      fixed(6, '글로벌경영학과, 배터리학과, 글로벌바이오메디컬공학과, 에너지학과, 양자정보공학과', '다군', { korean: null, math: null, english: 10, inquiry: 25, history: '감점' }, {
        domainCount: 4, ratioLabels: ordered('상위 35%, 차순위 30%', '상위 35%, 차순위 30%'), weightLabels: { korean: '1.40배, 1.20배', math: '1.40배, 1.20배' }, bonusDetail: '자연계열 모집단위 과탐 5%, 글로벌경영학과 미적분 3% 가점',
      }),
    ];
  }
  if (profile.u === '충북대') {
    const natural = { korean: 20, math: 30, english: 20, inquiry: 30, history: '미반영' } as RatioSnapshot;
    return [
      fixed(0, '인문계열', null, { korean: 30, math: 20, english: 20, inquiry: 30, history: '미반영' }),
      fixed(1, '농업생명환경대학, 생활과학대학, 간호대학, 자연과학자율전공계열', null, natural),
      fixed(2, '수학과, 정보통계학과, 수학교육과, 약학과, 제약학과, 의예과', null, natural),
      fixed(3, '자연과학대학, 공과대학, 전자정보대학, 수의과대학, 바이오헬스학부', null, natural),
    ];
  }
  if (profile.u === '한국기술교육대') {
    return [
      fixed(0, '공학, ICT계열 A형', null, { korean: 30, math: 35, english: 15, inquiry: 20, history: '미반영' }, { bonusDetail: '미적분 또는 기하 10% 가점' }),
      fixed(1, '공학, ICT계열 B형', null, { korean: 20, math: 35, english: 15, inquiry: 30, history: '미반영' }, { bonusDetail: '미적분 또는 기하 10% 가점' }),
      fixed(2, '사회계열', null, { korean: 35, math: 20, english: 20, inquiry: 25, history: '미반영' }),
    ];
  }
  if (profile.u === '고신대') {
    return [
      fixed(0, '전 모집단위 (간호학과, 의예과 제외)', '나군', { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', sbOverride: true, sbDetailOverride: '학생부 교과 40%' }),
      fixed(1, '전 모집단위 (간호학과, 의예과 제외)', '다군', { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', sbOverride: false }),
      fixed(2, '간호학과', '다군', { korean: 25, math: 25, english: 25, inquiry: 25, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 선택 시 수학 취득점수 10% 가점', sbOverride: false }),
      fixed(3, '의예과', '다군', { korean: 20, math: 30, english: 30, inquiry: 20, history: '미반영' }, { englishMethod: '등급 환산', sbOverride: false }),
    ];
  }
  if (profile.u === '대구대') {
    return [
      fixed(0, '인문사회계열', null, { korean: 30, math: 20, english: 30, inquiry: 20, history: '가점' }, { bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 출결 10%' }),
      fixed(1, '자연과학, 공학계열', null, { korean: 20, math: 30, english: 30, inquiry: 20, history: '가점' }, { bonusDetail: '과탐 5%, 한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 출결 10%' }),
      fixed(2, '예체능계열', null, { korean: 40, math: null, english: 30, inquiry: 30, history: '가점' }, { bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 출결 10%' }),
    ];
  }
  if (profile.u === '대전대') {
    return [
      fixed(0, '한의예과', null, { korean: 27, math: 28, english: 20, inquiry: 25, history: '가점' }, { bonusDetail: '미적분 또는 기하 3점, 과탐 과목당 1.5점, 한국사 등급별 가점' }),
      flexible(1, '군사학과', null, 3, '상위 33.33%', { bonusDetail: '한국사 등급별 가점' }),
      flexible(2, '간호학과, 물리치료학과, 임상병리학과, 응급구조학과', null, 3, '상위 33.33%', { bonusDetail: '한국사 등급별 가점' }),
      flexible(3, '일반학과', null, 2, '상위 50%', { bonusDetail: '한국사 등급별 가점' }),
      flexible(4, '스포츠과학부', null, 2, '상위 50%', { bonusDetail: '한국사 등급별 가점' }),
    ];
  }
  if (profile.u === '세한대') {
    return [fixed(0, '전 모집단위', null, { korean: 25, math: 25, english: 25, inquiry: 25, history: '가점' }, {
      englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', sbOverride: true, sbDetailOverride: '학생부 교과 30%', metricsOverride: ['등급'],
    })];
  }
  if (profile.u === '공주대') {
    const optionalThird: RatioLabels = { korean: '(33.33%)', math: '(33.33%)', english: '(33.33%)', inquiry: '(33.33%)' };
    return [
      flexible(0, '인문사회계열, 예체능계열, 자율전공학부', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연계열, 공학계열 (수학교육과 제외)', null, { korean: null, math: 33.33, english: null, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'], ratioLabels: { ...optionalThird, math: '33.33%' }, weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' } }),
      fixed(2, '수학교육과', null, { korean: null, math: 33.33, english: null, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', bonusDetail: '확률과 통계 응시 시 수학 반영점수 0.7배', metricsOverride: ['백분위', '등급'], ratioLabels: { ...optionalThird, math: '33.33%' }, weightLabels: { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' } }),
    ];
  }
  if (profile.u === '대진대') {
    const ratioLabels: RatioLabels = { korean: '상위 60%, 차순위 40%', math: '상위 60%, 차순위 40%', english: '상위 60%, 차순위 40%', inquiry: '차순위 40%' };
    const weightLabels: RatioLabels = { korean: '1.20배, 0.80배', math: '1.20배, 0.80배', english: '1.20배, 0.80배', inquiry: '0.80배' };
    const row = (formulaId: number, trackName: string, bonusDetail: string): FormulaRow => fixed(formulaId, trackName, null, { korean: null, math: null, english: null, inquiry: null, history: '선택 반영' }, { domainCount: 2, englishMethod: '등급 환산', bonusDetail, metricsOverride: ['백분위', '등급'], ratioLabels, weightLabels });
    return [row(0, '인문사회, 예체능계열', '없음'), row(1, '이공계열', '미적분 또는 기하 10%, 과탐 7% 가점')];
  }
  if (profile.u === '성공회대') {
    return [fixed(0, '전 모집단위', null, { korean: null, math: null, english: 33.3, inquiry: 33.3, history: '가점' }, {
      domainCount: 3,
      englishMethod: '등급 환산',
      bonusDetail: '미래융합학부, 소프트웨어융합학부는 수학 반영 시 10% 가점, 수학 반영비율 33.4% 상한',
      metricsOverride: ['백분위', '등급'],
      ratioLabels: { korean: '(33.40%)', math: '(33.40%)' },
      weightLabels: { korean: '1.00배', math: '1.00배' },
    })];
  }
  if (profile.u === '아주대') {
    return [
      fixed(0, '자연1', null, { korean: 20, math: 35, english: 15, inquiry: 30, history: '감점' }, { bonusDetail: '미적분 또는 기하 3%, 과탐 3% 가점', metricsOverride: ['표준점수', '변환표준점수', '등급'] }),
      fixed(1, '자연2', null, { korean: 20, math: 40, english: 10, inquiry: 30, history: '감점' }, { metricsOverride: ['표준점수', '변환표준점수', '등급'] }),
      fixed(2, '인문1', null, { korean: 25, math: 40, english: 15, inquiry: 20, history: '감점' }, { metricsOverride: ['표준점수', '변환표준점수', '등급'] }),
      fixed(3, '인문2', null, { korean: 35, math: 25, english: 15, inquiry: 25, history: '감점' }, { metricsOverride: ['표준점수', '변환표준점수', '등급'] }),
    ];
  }
  if (profile.u === '총신대') {
    return [fixed(0, '인문사회계열, 사범계열', '가군', { korean: null, math: null, english: 30, inquiry: 30, history: '감점' }, {
      domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'], ratioLabels: { korean: '(40%)', math: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배' },
    })];
  }
  if (profile.u === '한경국립대') {
    const typeLabels: RatioLabels = { korean: '(40%)', math: '(40%)', english: '(40%)', inquiry: '20%' };
    const typeWeights: RatioLabels = { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' };
    const typeRow = (formulaId: number, trackName: string, bonusDetail: string): FormulaRow => fixed(formulaId, trackName, '다군', { korean: null, math: null, english: null, inquiry: 20, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', bonusDetail, metricsOverride: ['백분위', '등급'], ratioLabels: typeLabels, weightLabels: typeWeights });
    return [
      typeRow(0, '유형1 인문융합공공인재, 법경영, 복지융합, 디자인예술스포츠', '없음'),
      typeRow(1, '유형2 웰니스산업융합, 생명자원, 건축융합', '미적분 또는 기하 15%, 과탐 10% 가점'),
      typeRow(2, '유형3 공학, 컴퓨터, ICT, 전자전기', '미적분 또는 기하 20%, 과탐Ⅰ 10%, 과탐Ⅱ 15% 가점'),
      typeRow(3, 'HK자율전공학부', '미적분 또는 기하 15% 가점'),
    ];
  }
  if (profile.u === '한국교통대') {
    return [flexible(0, '전 모집단위', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '화성의과학대') {
    return [fixed(0, '전 모집단위', '다군', { korean: null, math: null, english: null, inquiry: 30, history: '미반영' }, {
      domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['표준점수', '등급'], sbOverride: true, sbDetailOverride: '학생부 교과 20%', ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)', inquiry: '30%' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' },
    })];
  }
  if (profile.u === '경운대') {
    const common = { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' } as RatioSnapshot, metricsOverride: ['백분위', '등급'] };
    return [
      flexible(0, '전 모집단위', null, 3, '상위 33.33%', { ...common, examNameOverride: '일반1전형', sbOverride: false, bonusDetail: '한국사 등급별 가점' }),
      flexible(1, '전 모집단위', null, 3, '상위 33.33%', { ...common, examNameOverride: '일반2전형', sbOverride: true, sbDetailOverride: '학생부 70%', bonusDetail: '한국사 등급별 가점' }),
    ];
  }
  if (profile.u === '광주대') {
    return [fixed(0, '전 모집단위', null, { korean: 30, math: 30, english: 25, inquiry: 10, history: '5%' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '국립부경대') {
    return [
      fixed(0, '인문사회계열, 패션디자인학과', null, { korean: 30, math: 25, english: 20, inquiry: 25, history: '가점' }, { bonusDetail: '한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
      fixed(1, '자연계열', null, { korean: 25, math: 30, english: 20, inquiry: 25, history: '가점' }, { bonusDetail: '과탐Ⅰ 3%, 과탐Ⅱ 5%, 미적분 또는 기하 7% 또는 10%, 한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
      fixed(2, '예체능계열 (패션디자인학과 제외)', null, { korean: 35, math: null, english: 35, inquiry: 30, history: '가점' }, { bonusDetail: '한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
      fixed(3, '공통계열', null, { korean: 30, math: 30, english: 20, inquiry: 20, history: '가점' }, { bonusDetail: '한국사 등급별 가점', metricsOverride: ['표준점수', '등급'] }),
    ];
  }
  if (profile.u === '국립한밭대') {
    return [
      fixed(0, '공학계열', null, { korean: null, math: 40, english: null, inquiry: null, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'], ratioLabels: { korean: '(30%)', math: '40%', english: '(30%)', inquiry: '(30%)' }, weightLabels: { korean: '0.90배', math: '1.20배', english: '0.90배', inquiry: '0.90배' } }),
      flexible(1, '인문, 경상, 디자인계열', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '금강대') {
    return [fixed(0, '전 모집단위', '다군', { korean: null, math: null, english: null, inquiry: 30, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', bonusDetail: '한국사 응시 필수, 점수 미반영', metricsOverride: ['백분위', '등급'], ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)', inquiry: '30%' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' } })];
  }
  if (profile.u === '김천대') {
    return [fixed(0, '전 모집단위', '가군', { korean: null, math: null, english: 40, inquiry: 20, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'], ratioLabels: { korean: '(40%)', math: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배' } })];
  }
  if (profile.u === '동명대') {
    return [fixed(0, '전 모집단위 (문화예술학부 제외)', null, { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, { domainCount: 4, englishMethod: '등급 환산', metricsOverride: ['표준점수', '등급'], ratioLabels: { korean: '표준점수', math: '표준점수', english: '등급 환산', inquiry: '상위 1과목 표준점수' } })];
  }
  if (profile.u === '동신대') {
    return [
      fixed(0, '한의예과, 간호학과, 물리치료학과', '가군', { korean: 25, math: 25, english: 20, inquiry: 20, history: '10%' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 5% 가점', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '전 모집단위', '다군', { korean: 25, math: 25, english: 20, inquiry: 20, history: '10%' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 5% 가점', metricsOverride: ['백분위', '등급'], sbOverride: true, sbDetailOverride: '학생부 교과 16%, 출결 4%' }),
    ];
  }
  if (profile.u === '원광대') {
    const rawFormula = (formulaId: number, trackName: string, maximum: string, inquiryLabel: string): FormulaRow => fixed(formulaId, trackName, null, { korean: null, math: null, english: null, inquiry: null, history: '가점' }, { domainCount: 4, englishMethod: '등급 환산', bonusDetail: `한국사 등급별 가점, 수능 환산총점 ${maximum}`, metricsOverride: ['백분위', '표준점수', '등급'], ratioLabels: { korean: '표준점수 ×1.0', math: '표준점수 ×1.2', english: '등급 환산', inquiry: inquiryLabel } });
    return [
      rawFormula(0, '의예과, 치의예과, 한의예과(자연), 약학과', '740점', '0.5×(표준점수+백분위)'),
      rawFormula(1, '한약학과, 간호학과', '700점', '0.5×(표준점수+백분위)'),
      rawFormula(2, '그 외 모집단위', '400점', '상위 1과목'),
    ];
  }
  if (profile.u === '한남대') {
    const topThreeWeights: RatioLabels = { korean: '1.00배', math: '1.00배', english: '1.00배', inquiry: '1.00배' };
    return [
      fixed(0, '인문계열', null, { korean: 33.33, math: null, english: null, inquiry: null, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'], ratioLabels: { math: '(33.33%)', english: '(33.33%)', inquiry: '(33.33%)' }, weightLabels: topThreeWeights }),
      fixed(1, '자연계열', null, { korean: null, math: 33.33, english: null, inquiry: null, history: '가점' }, { domainCount: 3, englishMethod: '등급 환산', bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'], ratioLabels: { korean: '(33.33%)', english: '(33.33%)', inquiry: '(33.33%)' }, weightLabels: topThreeWeights }),
      flexible(2, '미술교육과, 스포츠과학과', null, 3, '상위 33.33%', { bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(3, '융합디자인학과', null, 3, '상위 33.33%', { bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '한라대') {
    return [flexible(0, '전 모집단위', null, 2, '상위 50%', { metricsOverride: ['백분위', '등급'], bonusDetail: '한국사 등급별 가점' })];
  }
  if (profile.u === '서울여대') {
    const ordered = '상위 35%, 차순위 30%, 셋째 20%, 넷째 15%';
    return [flexible(0, '인문계열, 자연계열', null, 4, ordered, { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, weightLabels: { korean: '1.40배, 1.20배, 0.80배, 0.60배', math: '1.40배, 1.20배, 0.80배, 0.60배', english: '1.40배, 1.20배, 0.80배, 0.60배', inquiry: '1.40배, 1.20배, 0.80배, 0.60배' }, bonusDetail: '수학과 미적분 또는 기하 20% 가점', metricsOverride: ['백분위', '등급'] })];
  }
  if (profile.u === '성결대') {
    return [fixed(0, '인문계열, 자연계열', null, { korean: null, math: null, english: null, inquiry: 30, history: '미반영' }, { domainCount: 3, englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'], ratioLabels: { korean: '(35%)', math: '(35%)', english: '(35%)', inquiry: '30%' }, weightLabels: { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' } })];
  }
  if (profile.u === '신한대') {
    return [
      flexible(0, '전 모집단위', null, 2, '상위 50%', { examNameOverride: '일반전형1', ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, metricsOverride: ['백분위', '등급'] }),
      flexible(1, '전 모집단위', null, 3, '상위 55%, 차순위 30%, 셋째 15%', { examNameOverride: '일반전형2', ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, weightLabels: { korean: '1.65배, 0.90배, 0.45배', math: '1.65배, 0.90배, 0.45배', english: '1.65배, 0.90배, 0.45배', inquiry: '1.65배, 0.90배, 0.45배' }, metricsOverride: ['백분위', '등급'] }),
      flexible(2, '전 모집단위', null, 3, '상위 50%, 차순위 50%', { examNameOverride: '일반전형3', ratios: { korean: null, math: null, english: null, inquiry: null, history: '선택 반영' }, metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '안양대') {
    return [
      fixed(0, '인문계열', null, { korean: 40, math: null, english: 30, inquiry: 30, history: '미반영' }, { englishMethod: '등급 환산', metricsOverride: ['백분위', '등급'] }),
      fixed(1, '자연계열', null, { korean: null, math: 40, english: 30, inquiry: 30, history: '미반영' }, { englishMethod: '등급 환산', bonusDetail: '미적분 또는 기하 10% 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(2, '자유전공학부', null, 3, '상위 33.33%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' }, bonusDetail: '미적분 또는 기하 10% 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '한성대') {
    return [
      fixed(0, '인문사회, 디자인계열', null, { korean: 35, math: 25, english: 20, inquiry: 20, history: '가점' }),
      fixed(1, '공학계열', null, { korean: 25, math: 35, english: 20, inquiry: 20, history: '가점' }),
      flexible(2, '상상력인재학부', null, 4, '상위 40%, 차순위 30%, 셋째 20%, 넷째 10%', { ratios: { korean: null, math: null, english: null, inquiry: null, history: '가점' }, weightLabels: { korean: '1.60배, 1.20배, 0.80배, 0.40배', math: '1.60배, 1.20배, 0.80배, 0.40배', english: '1.60배, 1.20배, 0.80배, 0.40배', inquiry: '1.60배, 1.20배, 0.80배, 0.40배' } }),
      fixed(3, 'ICT디자인학부(야)', null, { korean: 40, math: null, english: 40, inquiry: 20, history: '가점' }),
      fixed(4, '야간 모집단위', null, { korean: null, math: null, english: 20, inquiry: null, history: '가점' }, { domainCount: 3, ratioLabels: { korean: '(40%)', math: '(40%)', english: '20%', inquiry: '(40%)' }, weightLabels: { korean: '1.20배', math: '1.20배', english: '0.60배', inquiry: '1.20배' } }),
    ];
  }
  if (profile.u === '한신대') {
    const ordered = '상위 50%, 차순위 30%, 셋째 20%';
    const weights: RatioLabels = { korean: '1.50배, 0.90배, 0.60배', math: '1.50배, 0.90배, 0.60배', english: '1.50배, 0.90배, 0.60배', inquiry: '1.50배, 0.90배, 0.60배' };
    return [
      flexible(0, '인문사회, 예체능계열', null, 3, ordered, { weightLabels: weights, bonusDetail: '한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
      flexible(1, '자연계열', null, 3, ordered, { weightLabels: weights, bonusDetail: '미적분 또는 기하 5%, 한국사 등급별 가점', metricsOverride: ['백분위', '등급'] }),
    ];
  }
  if (profile.u === '가야대') {
    return [{
      formulaId: 0,
      trackName: '전체 모집단위',
      groupHint: '다군',
      ratios: { korean: null, math: null, english: null, inquiry: 10, history: '등급 환산' },
      weights: { korean: null, math: null, english: null, inquiry: 0.30 },
      domainCount: 3,
      englishMethod: '등급 환산',
      bonusDetail: '국어, 수학, 영어 중 상위 2개 영역 각 40%, 한국사 10%',
      examNameOverride: '일반전형',
      metricsOverride: ['백분위', '등급'],
      ratioLabels: { korean: '(40%)', math: '(40%)', english: '(40%)', inquiry: '10%' },
      weightLabels: { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.30배' },
      sbOverride: true,
      sbDetailOverride: '학생부 교과 30%',
    }];
  }
  if (profile.u === '극동대') {
    const ratios: RatioSnapshot = { korean: null, math: null, english: null, inquiry: 30, history: '미반영' };
    const weights: WeightSnapshot = { korean: null, math: null, english: null, inquiry: 0.90 };
    const ratioLabels: RatioLabels = { korean: '(35%)', math: '(35%)', english: '(35%)', inquiry: '30%' };
    const weightLabels: RatioLabels = { korean: '1.05배', math: '1.05배', english: '1.05배', inquiry: '0.90배' };
    const row = (formulaId: number, groupHint: string, trackName: string): FormulaRow => ({
      formulaId,
      trackName,
      groupHint,
      ratios,
      weights,
      domainCount: 3,
      englishMethod: '등급 환산',
      bonusDetail: '국어, 수학, 영어 중 상위 2개 영역 반영, 한국사 응시 필수, 점수 미반영',
      examHint: '일반학생',
      metricsOverride: ['백분위', '등급'],
      ratioLabels,
      weightLabels,
      sbOverride: false,
      sbDetailOverride: '미반영',
    });
    return [
      row(0, '나군', '전체 모집단위'),
      row(1, '다군', '만화애니메이션학과, 연극연기학과, 스포츠재활학과'),
    ];
  }
  if (profile.u === '목포가톨릭대') {
    const ratios: RatioSnapshot = { korean: null, math: null, english: 40, inquiry: 20, history: '가점' };
    const weights: WeightSnapshot = { korean: null, math: null, english: 1.20, inquiry: 0.60 };
    const ratioLabels: RatioLabels = { korean: '(40%)', math: '(40%)', english: '40%', inquiry: '20%' };
    const weightLabels: RatioLabels = { korean: '1.20배', math: '1.20배', english: '1.20배', inquiry: '0.60배' };
    const row = (formulaId: number, trackName: string, sb: boolean, sbDetail: string): FormulaRow => ({
      formulaId,
      trackName,
      groupHint: '가군',
      ratios,
      weights,
      domainCount: 3,
      englishMethod: '등급 환산',
      bonusDetail: '국어 또는 수학 중 상위 1개 영역 40%, 한국사 등급별 가점',
      examNameOverride: '일반학생',
      metricsOverride: ['백분위', '등급'],
      ratioLabels,
      weightLabels,
      sbOverride: sb,
      sbDetailOverride: sbDetail,
    });
    return [
      row(0, '간호학과', false, '미반영'),
      row(1, '사회복지학과', true, '학생부 40%'),
      {
        formulaId: 2,
        trackName: '유아교육과 (2027학년도 미선발)',
        groupHint: '가군',
        ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' },
        weights: { korean: null, math: null, english: null, inquiry: null },
        domainCount: 0,
        englishMethod: '미반영',
        bonusDetail: '2027학년도 모집단위 없음',
        examNameOverride: '2027학년도 미선발',
        metricsOverride: [],
        sbOverride: false,
        sbDetailOverride: '미반영',
      },
    ];
  }
  if (profile.u === '서울기독대') {
    return [
      fixed(0, '기독교신학, 사회복지, 글로벌휴먼경영, 상담심리', '나군', { korean: 40, math: null, english: 30, inquiry: 30, history: '미반영' }, {
        examNameOverride: '일반전형', englishMethod: '등급 환산', metricsOverride: ['등급'], sbOverride: true, sbDetailOverride: '학생부 40%',
      }),
      {
        formulaId: 1,
        trackName: '무용, 음악, 뮤지컬, 운동건강관리',
        groupHint: '다군',
        ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' },
        weights: { korean: null, math: null, english: null, inquiry: null },
        domainCount: 0,
        englishMethod: '미반영',
        bonusDetail: '학생부 20% + 실기 80%',
        examNameOverride: '일반전형',
        metricsOverride: ['등급'],
        sbOverride: true,
        sbDetailOverride: '학생부 20%',
      },
    ];
  }
  if (profile.u === '서울장신대') {
    return [{
      formulaId: 0,
      trackName: '전체 모집단위',
      groupHint: '다군',
      ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' },
      weights: { korean: null, math: null, english: null, inquiry: null },
      domainCount: 0,
      englishMethod: '미반영',
      bonusDetail: '2027학년도 정시 모집인원 없음, 수시 미충원 발생 시 별도 공지',
      examNameOverride: '2027학년도 미선발',
      metricsOverride: [],
    }];
  }
  if (profile.u === '장로회신학대') {
    return [
      flexible(0, '자유전공, 신학과, 기독교교육과', '나군', 3, '상위 3개 영역 각 33.3%', {
        ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' },
        englishMethod: '등급 환산',
        bonusDetail: '국어, 수학, 영어, 탐구 중 상위 3개 영역 반영',
        examNameOverride: '일반전형',
        metricsOverride: ['백분위', '등급'],
      }),
      fixed(1, '교회음악학과', '나군', { korean: 50, math: null, english: 50, inquiry: null, history: '미반영' }, {
        englishMethod: '등급 환산', examNameOverride: '일반전형', metricsOverride: ['백분위', '등급'],
      }),
    ];
  }
  if (profile.u === '중원대') {
    return [flexible(0, '전체 모집단위', '가군', 3, '상위 3개 영역 각 33.3%', {
      ratios: { korean: null, math: null, english: null, inquiry: null, history: '미반영' },
      englishMethod: '등급 환산',
      bonusDetail: '국어, 수학, 영어, 탐구 중 상위 3개 영역 반영, 한국사 응시 필수, 가산점 없음',
      examNameOverride: '일반전형 1',
      metricsOverride: ['백분위', '등급'],
      sbOverride: false,
      sbDetailOverride: '미반영',
    })];
  }
  if (profile.u !== '가천대') return null;

  const dynamicRatios: RatioSnapshot = {
    korean: null,
    math: null,
    english: null,
    inquiry: null,
    history: '미반영',
  };
  const dynamicWeights: WeightSnapshot = { korean: null, math: null, english: null, inquiry: null };
  const dynamicRatioLabels: RatioLabels = {
    korean: '40% / 30%',
    math: '40% / 30%',
    english: '20% / 10%',
    inquiry: '20% / 10%',
  };
  const dynamicWeightLabels: RatioLabels = {
    korean: '1.60배 / 1.20배',
    math: '1.60배 / 1.20배',
    english: '0.80배 / 0.40배',
    inquiry: '0.80배 / 0.40배',
  };
  const fixedRatios: RatioSnapshot = { korean: 25, math: 30, english: 20, inquiry: 25, history: '미반영' };

  const dynamicRow = (formulaId: number, examHint: string, trackName: string, groupHint: string, metric: string): FormulaRow => ({
    formulaId,
    examHint,
    trackName,
    groupHint,
    ratios: dynamicRatios,
    weights: dynamicWeights,
    domainCount: 4,
    englishMethod: '환산',
    bonusDetail: '한국사 응시 필수, 점수 미반영',
    metricsOverride: [metric],
    ratioLabels: dynamicRatioLabels,
    weightLabels: dynamicWeightLabels,
  });
  const fixedRow = (formulaId: number, trackName: string, groupHint: string): FormulaRow => ({
    formulaId,
    examHint: '일반전형1',
    trackName,
    groupHint,
    ratios: fixedRatios,
    weights: practicalWeights(fixedRatios),
    domainCount: 4,
    englishMethod: '환산',
    bonusDetail: '한국사 응시 필수, 점수 미반영',
    metricsOverride: ['백분위'],
  });

  return [
    dynamicRow(0, '일반전형1', '가군 일반 모집단위', '가군', '백분위'),
    dynamicRow(1, '일반전형1', '나군 일반 모집단위', '나군', '백분위'),
    dynamicRow(2, '일반전형1', '다군 일반 모집단위', '다군', '백분위'),
    fixedRow(3, '의예과, 한의예과, 약학과', '가군'),
    dynamicRow(4, '일반전형2', '가군 모집단위', '가군', '등급'),
    dynamicRow(5, '일반전형2', '나군 모집단위', '나군', '등급'),
    dynamicRow(6, '일반전형2', '다군 모집단위', '다군', '등급'),
  ];
}

function validRatioValues(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.every((value) => value >= 5 && value <= 80) && total >= 99 && total <= 101;
}

function formulaTrackName(segment: string, index: number) {
  let value = stripBonusContentFromTrack(segment);
  const headerMarkers = ['가산점/비고', '가산점', '탐구수', '비고'];
  let cut = -1;
  let markerLength = 0;
  headerMarkers.forEach((marker) => {
    const position = value.lastIndexOf(marker);
    if (position > cut) {
      cut = position;
      markerLength = marker.length;
    }
  });
  if (cut >= 0) value = value.slice(cut + markerLength);
  value = value
    .replace(/^(?:(?:전형명?|군)\s+)*(?:계열(?:\(학과\))?\s+)?(?:유형\s+)?국\s+확\s+미\/기\s+영\s+사\s+과(?:\s+한)?(?:\s+제2(?:외|\/외|외\/한))?\s*/g, '')
    .replace(/^(?:일반학생|일반전형|수능위주)\s*[ⅠⅡⅢⅣIV123]?\s*/g, '')
    .replace(/^[\s,.;:()%\d]+/, '')
    .replace(/^(?:감점|가산점?|등급\s*반영|등급별\s*환산)\s*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
  const trailingType = value.match(/\s+([A-C])형?$/i);
  if (trailingType && !/^유형\s*[A-C]$/i.test(value)) {
    value = `${value.slice(0, trailingType.index).trim()} (유형 ${trailingType[1].toUpperCase()})`;
  }
  const afterNumberSequence = value.split(/\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)+/).at(-1)?.trim();
  if (afterNumberSequence && afterNumberSequence.length >= 2) value = afterNumberSequence;
  const known = [...value.matchAll(/전\s*모집단위|전체\s*모집단위|인문(?:사회|계|대학)?|자연(?:계|대학)?|예체능(?:계)?|공학계|상경(?:계)?|의예과|약학과|간호학과|자유전공(?:학부)?|유형\s*[A-CⅠⅡⅢ123]|음악|미술|체육/g)];
  if ((value.length > 70 || /전형\s|계열\s+유형|국\s+확|반영방법/.test(value)) && known.length) value = known.at(-1)?.[0] ?? value;
  if (!value || /등급|반영방법|점수/.test(value) || value.length > 55) return `계열 ${index + 1}`;
  return value;
}

function stripBonusContentFromTrack(segment: string) {
  let value = segment
    .replace(/미\s*\/\s*기/g, '미적분/기하')
    .replace(/\s+/g, ' ')
    .trim();
  const phrases = extractBonusPhrases(value).sort((left, right) => right.length - left.length);
  phrases.forEach((phrase) => {
    value = value.replace(phrase, ' ');
  });
  return value
    .replace(/^(?:\s*(?:가산점?|감점)\s*)+/, '')
    .replace(/^(?:\([^)]*(?:변환표준점수|백분위|표준점수|반영\s*시|제외)[^)]*\)\s*)+/, '')
    .replace(/^[\s,.;:/-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function studentRecordForMethod(selection: string, profile: ProfileView) {
  const normalized = selection.replace(/\s+/g, ' ');
  const candidates: { pattern: RegExp; label: string }[] = [
    { pattern: /학생부\s*종합(?:\s*평가|\s*서류)?\s*(\d+(?:\.\d+)?)\s*%?/, label: '학생부종합평가' },
    { pattern: /학생부\s*교과\s*(\d+(?:\.\d+)?)\s*%?/, label: '학생부교과' },
    { pattern: /교과평가\s*(\d+(?:\.\d+)?)\s*%?/, label: '교과평가' },
    { pattern: /학업충실도(?:평가)?\s*(\d+(?:\.\d+)?)\s*%?/, label: '학업충실도평가' },
    { pattern: /서류평가\s*(\d+(?:\.\d+)?)\s*%?/, label: '서류평가' },
    { pattern: /학생부\s*평가\s*(\d+(?:\.\d+)?)\s*%?/, label: '학생부평가' },
    { pattern: /학생부\s*(\d+(?:\.\d+)?)\s*%?/, label: '학생부교과' },
    { pattern: /출결\s*(\d+(?:\.\d+)?)\s*%?/, label: '출결' },
  ];
  for (const candidate of candidates) {
    const rate = normalized.match(candidate.pattern)?.[1];
    if (rate) {
      const label = profile.u === '동국대' && candidate.label === '학생부교과' ? '학생부평가' : candidate.label;
      return { sb: true, sbDetail: `${label} ${rate}%` };
    }
  }
  if (/출결.{0,30}감점|감점.{0,30}출결/.test(normalized)) return { sb: true, sbDetail: '출결 감점' };
  const markers = ['학생부종합', '학생부', '교과평가', '출결', '학업충실도', '서류평가'];
  const found = markers.find((marker) => normalized.includes(marker));
  if (found) return { sb: true, sbDetail: profile.sbDetail && profile.sbDetail !== '확인 필요' ? profile.sbDetail : found };
  if (/수능\s*100/.test(selection)) return { sb: false, sbDetail: '미반영' };
  return { sb: profile.sb, sbDetail: profile.sbDetail };
}

function selectionForGroup(selection: string, admissionGroup: string) {
  if (admissionGroup === '군외') return selection;
  const groupLetter = admissionGroup[0];
  const markerPattern = /([가나다])군(?:\(([^)]*)\))?/g;
  const markers = [...selection.matchAll(markerPattern)];
  const targetIndex = markers.findIndex((marker) => marker[1] === groupLetter);
  if (targetIndex < 0) return selection;

  const count = markers[targetIndex][2];
  const hasMethod = (value: string) => /수능|학생부|교과|서류|면접|실기|출결/.test(value);
  let method = '';
  for (let index = targetIndex; index < markers.length; index += 1) {
    const start = (markers[index].index ?? 0) + markers[index][0].length;
    const end = markers[index + 1]?.index ?? selection.length;
    const candidate = selection.slice(start, end).replace(/^[\s,:/]+|[\s,]+$/g, '').trim();
    if (hasMethod(candidate)) {
      method = candidate;
      break;
    }
  }
  if (!method) method = selection.replace(/(?:가|나|다)군(?:\([^)]*\))?,?\s*/g, '').trim();
  return `${admissionGroup}${count ? `(${count})` : ''} ${method}`.trim();
}

function englishReflectionMethod(profile: ProfileView) {
  if (profile.ratios.english !== null) return '등급 환산';
  const text = `${profile.ratio} ${profile.metric}`
    .replace(/[가-힣A-Za-z]+\d+/g, (word) => word.replace(/\d+/g, ''))
    .replace(/\((\d+(?:\.\d+)?)\)/g, ' ');
  const marker = text.match(/\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+(가산|감점)\s+\d+(?:\.\d+)?/i)?.[1];
  if (marker === '가산') return '가산점';
  if (marker === '감점') return '감점';
  if (/비율적용/.test(text)) return '등급별 비율';
  return '등급 환산';
}

function bonusDetailForProfile(profile: ProfileView, segment?: string) {
  if (segment !== undefined) {
    const local = extractBonusPhrases(segment);
    return local.length ? local.join(' / ') : '없음';
  }
  const all = extractBonusPhrases(`${profile.ratio} ${profile.metric}`);
  return all.length ? all.join(' / ') : '없음';
}

function extractBonusPhrases(value: string) {
  const text = value
    .replace(/미\s*\/\s*기/g, '미적분/기하')
    .replace(/\s+/g, ' ');
  const patterns = [
    /(?:미적분(?:\s*\/\s*기하)?|기하)[^,.;※]{0,32}?\d+(?:\.\d+)?\s*%/g,
    /(?:과학탐구|과탐|사회탐구|사탐)[^,.;※]{0,42}?\d+(?:\.\d+)?\s*(?:%|점)/g,
    /(?:물리|화학|생명과학|생물|지구과학|화|생|지)[ⅠⅡ12](?:\s*,\s*(?:물리|화학|생명과학|생물|지구과학|화|생|지)[ⅠⅡ12])?[^,.;※]{0,28}?\d+(?:\.\d+)?\s*(?:%|점)/g,
    /탐구\s*영역[^,.;※]{0,38}?\d+(?:\.\d+)?\s*(?:%|점)/g,
    /(?:Ⅰ\s*\+\s*Ⅱ|Ⅱ\s*\+\s*Ⅱ)[^,.;※]{0,28}?\d+(?:\.\d+)?\s*점/g,
  ];
  const phrases = patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0].trim()));
  return [...new Set(phrases)].filter((phrase) => !/^탐구\s*영역\s*중/i.test(phrase));
}

function reflectionSortKey(key: string, practical: boolean) {
  const nominalToPractical: Record<string, string> = {
    korean: 'koreanWeight',
    math: 'mathWeight',
    english: 'englishWeight',
    inquiry: 'inquiryWeight',
  };
  const practicalToNominal = Object.fromEntries(Object.entries(nominalToPractical).map(([nominal, weight]) => [weight, nominal]));
  return practical ? nominalToPractical[key] ?? key : practicalToNominal[key] ?? key;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function numericRange(minimum: string, maximum: string) {
  const parse = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const first = parse(minimum);
  const second = parse(maximum);
  if (first !== null && second !== null && first > second) return { minimum: second, maximum: first };
  return { minimum: first, maximum: second };
}

function inNumericRange(value: number | null, range: { minimum: number | null; maximum: number | null }) {
  if (value === null || !Number.isFinite(value)) return false;
  return (range.minimum === null || value >= range.minimum) && (range.maximum === null || value <= range.maximum);
}

function conciseExamName(row: Pick<ScoreRow, 'a' | 'exam'>) {
  const original = (row.exam ?? row.a ?? '').trim();
  const cleaned = original
    .replace(/^수능(?:위주)?\s*\(/, '')
    .replace(/\)$/, '')
    .replace(/^정시\s*\([가나다]\)\s*/, '')
    .replace(/^정시\s*/, '')
    .trim();
  return cleaned || '일반전형';
}

function displayRegion(region: string, university: string) {
  return region === '서울' && MAJOR_SEOUL_UNIVERSITIES.has(university) ? '주요서울' : region;
}

function changeCategoryClass(category: string) {
  const classes: Record<string, string> = {
    모집군: 'is-group',
    모집단위: 'is-department',
    전형방법: 'is-method',
    반영방법: 'is-reflection',
    학생부: 'is-record',
  };
  return classes[category] ?? 'is-other';
}

function localFileHref(path: string) {
  return `file:///${path.replaceAll('\\', '/')}`;
}

function formatNumber(value: number) {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('ko-KR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: 2 }).format(value);
}

function formatPlainNumber(value: number) {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('ko-KR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: 2, useGrouping: false }).format(value);
}

function formatFixedNumber(value: number, grouping = false) {
  return new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: grouping }).format(value);
}

function compactNumber(value: number | null, suffix = '', grouping = true) {
  return value === null ? '—' : `${grouping ? formatNumber(value) : formatPlainNumber(value)}${suffix}`;
}

function compactFixedNumber(value: number | null, suffix = '', grouping = false) {
  return value === null ? '—' : `${formatFixedNumber(value, grouping)}${suffix}`;
}

function displayRatio(value: number | null) {
  return value === null ? '' : value;
}

function displayRatioForRow(row: MethodView, domain: DomainKey) {
  return displayRatio(row.ratios[domain]) || row.ratioLabels?.[domain] || '';
}

function displayWeight(value: number | null, fallback?: string) {
  return value === null ? fallback ?? '' : value.toFixed(2);
}

function metricValue(row: MethodView, metric: string) {
  return row.metrics.includes(metric) ? '반영' : '';
}

function extractRatios(profile: Profile): RatioSnapshot {
  const text = `${profile.ratio} ${profile.metric}`;
  const cleaned = text
    .replace(/[가-힣A-Za-z]+\d+/g, (word) => word.replace(/\d+/g, ''))
    .replace(/\((\d+(?:\.\d+)?)\)/g, ' ');
  const numbers = [...cleaned.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((value) => value >= 5 && value <= 60);
  let ratios: number[] | null = null;
  const gradeEnglish = cleaned.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(가산|감점)\s+(\d+(?:\.\d+)?)/);
  if (gradeEnglish) {
    const candidate = [Number(gradeEnglish[1]), Number(gradeEnglish[2]), Number(gradeEnglish[4])];
    const total = candidate.reduce((sum, value) => sum + value, 0);
    if (candidate.every((value) => value >= 5 && value <= 60) && total >= 99 && total <= 101) {
      ratios = [candidate[0], candidate[1], Number.NaN, candidate[2]];
    }
  }
  if (!ratios) {
    for (let index = 0; index <= numbers.length - 4; index += 1) {
      const candidate = numbers.slice(index, index + 4);
      const total = candidate.reduce((sum, value) => sum + value, 0);
      if (total >= 99 && total <= 101) {
        ratios = candidate;
        break;
      }
    }
  }
  if (!ratios) {
    for (let index = 0; index <= numbers.length - 3; index += 1) {
      const candidate = numbers.slice(index, index + 3);
      const total = candidate.reduce((sum, value) => sum + value, 0);
      if (total >= 99 && total <= 101) {
        ratios = [candidate[0], candidate[1], Number.NaN, candidate[2]];
        break;
      }
    }
  }
  const history = koreanHistoryMethod(text);
  return {
    korean: ratios?.[0] ?? null,
    math: ratios?.[1] ?? null,
    english: ratios && Number.isFinite(ratios[2]) ? ratios[2] : null,
    inquiry: ratios?.[3] ?? null,
    history,
  };
}

function koreanHistoryMethod(value: string) {
  const text = value.replace(/\s+/g, ' ');
  const snippets = [...text.matchAll(/한국사/g)].map((match) => {
    const start = Math.max(0, (match.index ?? 0) - 70);
    const end = Math.min(text.length, (match.index ?? 0) + 110);
    return text.slice(start, end);
  });
  if (!snippets.length) return '—';
  if (snippets.some((snippet) => /한국사.{0,55}(?:가산점?|가점)|(?:가산점?|가점).{0,55}한국사/.test(snippet))) return '가점';
  if (snippets.some((snippet) => /한국사.{0,55}감점|감점.{0,55}한국사/.test(snippet))) return '감점';
  if (snippets.some((snippet) => /한국사.{0,75}(?:환산점수|등급별\s*환산|반영점수|배점)|(?:환산점수|등급별\s*환산|반영점수|배점).{0,75}한국사/.test(snippet))) return '등급 환산';
  if (snippets.some((snippet) => /한국사.{0,75}(?:미반영|점수\s*반영\s*안|반영하지\s*않|응시\s*여부|응시여부|자격\s*조건|필수\s*응시|응시\s*필수)/.test(snippet))) return '미반영';
  return '—';
}

function practicalWeights(ratios: RatioSnapshot): WeightSnapshot {
  const values = [ratios.korean, ratios.math, ratios.english, ratios.inquiry].filter((value): value is number => value !== null);
  if (!values.length) return { korean: null, math: null, english: null, inquiry: null };
  const baseline = 100 / values.length;
  const weight = (value: number | null) => value === null ? null : Number((value / baseline).toFixed(2));
  return {
    korean: weight(ratios.korean),
    math: weight(ratios.math),
    english: weight(ratios.english),
    inquiry: weight(ratios.inquiry),
  };
}

function reflectedDomainCount(ratios: RatioSnapshot) {
  return [ratios.korean, ratios.math, ratios.english, ratios.inquiry].filter((value) => value !== null).length;
}

function ratioTone(ratios: WeightSnapshot, key: keyof WeightSnapshot) {
  const values = [ratios.korean, ratios.math, ratios.english, ratios.inquiry].filter((value): value is number => value !== null);
  const uniqueValues = new Set(values);
  if (uniqueValues.size < 2 || ratios[key] === null) return '';
  if (ratios[key] === Math.max(...values)) return 'ratio-high';
  if (ratios[key] === Math.min(...values)) return 'ratio-low';
  return '';
}

function attach2026ResultSummaries(methods: MethodView[], scores: ScoreRow[]) {
  const methodsByUniversity = new Map<string, MethodView[]>();
  methods.forEach((method) => {
    const list = methodsByUniversity.get(method.u) ?? [];
    list.push(method);
    methodsByUniversity.set(method.u, list);
  });
  const assignedRows = new Map<string, ScoreRow[]>();

  scores.filter((score) => score.y === 2026).forEach((score) => {
    const profileName = SCORE_PROFILE_ALIASES[score.u] ?? score.u;
    const universityMethods = methodsByUniversity.get(profileName) ?? [];
    if (!universityMethods.length) return;
    const scoreGroup = score.g ? `${score.g.replace(/군$/, '')}군` : '';
    const groupMatches = universityMethods.filter((method) => !scoreGroup || atomicAdmissionGroups(method.admissionGroup).includes(scoreGroup));
    const groupPool = groupMatches.length ? groupMatches : universityMethods;
    const examMatches = groupPool.filter((method) => historicalExamMatches(score, method));
    const examPool = examMatches.length ? examMatches : groupPool;
    const ranked = examPool
      .map((method, index) => ({
        method,
        index,
        rank: scoreMethodRank(score, method),
        groupRank: departmentGroupRank(score.d, method.trackName),
        categoryCount: methodTrackCategories(method).length,
      }))
      .sort((left, right) => right.groupRank - left.groupRank || right.rank - left.rank || left.categoryCount - right.categoryCount || left.index - right.index);
    const selected = ranked[0]?.method;
    if (!selected) return;
    const rows = assignedRows.get(selected.rowId) ?? [];
    rows.push(score);
    assignedRows.set(selected.rowId, rows);
  });

  return methods.map((method) => {
    const rows = assignedRows.get(method.rowId) ?? [];
    const result2026Rows = [...rows].sort((left, right) => left.d.localeCompare(right.d, 'ko') || left.id - right.id);
    return {
      ...method,
      result2026Rows,
      result2026: summarizeMethodResults(result2026Rows, method.conversionMax),
    };
  });
}

function splitMethodsByDepartment(methods: MethodView[], scores: ScoreRow[]) {
  const latestRowsByUniversity = new Map<string, ScoreRow[]>();
  const scoreGroups = new Map<string, ScoreRow[]>();
  scores.forEach((score) => {
    const profileName = SCORE_PROFILE_ALIASES[score.u] ?? score.u;
    const rows = scoreGroups.get(profileName) ?? [];
    rows.push(score);
    scoreGroups.set(profileName, rows);
  });
  scoreGroups.forEach((rows, university) => {
    const latestYear = Math.max(...rows.map((score) => score.y));
    latestRowsByUniversity.set(university, rows.filter((score) => score.y === latestYear));
  });

  return methods.flatMap((method) => {
    const resultRows = method.result2026Rows ?? [];
    let departmentRows = resultRows;
    if (!departmentRows.length) {
      const latestRows = latestRowsByUniversity.get(method.u) ?? [];
      const categories = methodTrackCategories(method);
      const categoryMatches = latestRows.filter((score) => categories.includes(scoreTrackCategory(score)));
      const categoryPool = categoryMatches.length ? categoryMatches : latestRows;
      const groupMatches = categoryPool.filter((score) => {
        const scoreGroup = score.g ? `${score.g.replace(/군$/, '')}군` : '군외';
        return atomicAdmissionGroups(method.admissionGroup).includes(scoreGroup);
      });
      const groupPool = groupMatches.length ? groupMatches : categoryPool;
      const examMatches = groupPool.filter((score) => historicalExamMatches(score, method));
      const examPool = examMatches.length ? examMatches : groupPool;
      const namedMatches = examPool.filter((score) => departmentGroupRank(score.d, method.trackName) > 0);
      departmentRows = namedMatches.length ? namedMatches : examPool;
    }

    const uniqueDepartmentRows = [...new Map(departmentRows.map((score) => [normalize(score.d), score])).values()]
      .sort((left, right) => left.d.localeCompare(right.d, 'ko') || left.id - right.id);
    if (uniqueDepartmentRows.length) {
      return uniqueDepartmentRows.map((score) => {
        const exact2026Rows = score.y === 2026 && historicalExamMatches(score, method) ? [score] : [];
        return {
        ...method,
        rowId: `${method.rowId}-department-${score.id}`,
        departmentName: score.d,
        departmentTrack: scoreTrackCategory(score),
        conversionMax: score.max ?? method.conversionMax,
        result2026Rows: exact2026Rows,
        result2026: summarizeMethodResults(exact2026Rows, score.max ?? method.conversionMax),
        };
      });
    }

    return methodTrackCategories(method).map((departmentTrack) => ({
      ...method,
      rowId: `${method.rowId}-track-${departmentTrack}`,
      departmentName: method.trackName,
      departmentTrack,
      result2026Rows: [],
      result2026: summarizeMethodResults([], method.conversionMax),
    }));
  });
}

function summarizeMethodResults(rows: ScoreRow[], fallbackMaximum: number | null): MethodResultSummary {
  const maximumValues = rows.map((score) => score.max).filter((value): value is number => value !== null);
  if (!maximumValues.length && fallbackMaximum !== null) maximumValues.push(fallbackMaximum);
  const emptyLabel = rows.length ? '미공개' : '—';
  return {
    percentile: summarizeRange(rows.map((score) => scoreCutMetric(score) === '백분위' ? score.p50 ?? score.p70 : null), emptyLabel, '%', true),
    converted: summarizeRange(rows.map((score) => score.cv50 ?? score.cv70), emptyLabel, '점', true),
    maximum: summarizeRange(maximumValues, emptyLabel),
  };
}

function summarizeRange(values: (number | null)[], emptyLabel = '—', unit = '', describeRange = false): ResultRange {
  const numbers = [...new Set(values.filter((value): value is number => value !== null && Number.isFinite(value)))].sort((a, b) => a - b);
  if (!numbers.length) return { label: emptyLabel, sortValue: null };
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const display = (value: number) => unit ? `${formatFixedNumber(value, false)}${unit}` : formatPlainNumber(value);
  return {
    label: first === last ? display(first) : describeRange ? `최저 ${display(first)} / 최고 ${display(last)}` : `${display(first)}~${display(last)}`,
    sortValue: first,
  };
}

function scoreCutMetric(score: ScoreRow): CutMetric {
  const values = [score.p50, score.p70].filter((value): value is number => value !== null);
  if (!values.length) return '성적';
  if (values.every((value) => value >= 0 && value <= 100)) return '백분위';
  return '성적';
}

function scoreGroupKey(score: Pick<ScoreRow, 'u' | 'y' | 'd'>) {
  return `${normalize(score.u)}|${score.y}|${normalize(score.d)}`;
}

function historicalAdmissionGroups(scores: ScoreRow[]) {
  const groupSets = new Map<string, Set<string>>();
  scores.forEach((score) => {
    if (!score.g) return;
    const key = scoreGroupKey(score);
    const groups = groupSets.get(key) ?? new Set<string>();
    atomicAdmissionGroups(score.g).forEach((group) => groups.add(group));
    groupSets.set(key, groups);
  });
  return new Map([...groupSets].map(([key, groups]) => [key, combinedAdmissionGroup([...groups])]));
}

function scoreMethodsForRow(score: ScoreRow, methods: MethodView[]) {
  if (!methods.length) return [];
  const targetGroup = score.g ? `${score.g.replace(/군$/, '')}군` : '';
  const groupMatches = targetGroup ? methods.filter((method) => atomicAdmissionGroups(method.admissionGroup).includes(targetGroup)) : methods;
  const candidates = groupMatches.length ? groupMatches : methods;
  const examMatches = candidates.filter((method) => historicalExamMatches(score, method));
  const examCandidates = examMatches.length ? examMatches : candidates;
  const trackMatches = examCandidates.filter((method) => scoreMethodRank(score, method) > 0);
  const bestRank = trackMatches.length ? Math.max(...trackMatches.map((method) => scoreMethodRank(score, method))) : 0;
  const pool = bestRank > 0
    ? trackMatches.filter((method) => scoreMethodRank(score, method) === bestRank)
    : examCandidates;
  const ranked = [...pool].sort((left, right) => {
    const leftGroup = targetGroup && atomicAdmissionGroups(left.admissionGroup).includes(targetGroup) ? 1 : 0;
    const rightGroup = targetGroup && atomicAdmissionGroups(right.admissionGroup).includes(targetGroup) ? 1 : 0;
    return rightGroup - leftGroup
      || scoreMethodRank(score, right) - scoreMethodRank(score, left)
      || left.examName.localeCompare(right.examName, 'ko');
  });
  const uniqueRows = new Map<string, MethodView>();
  ranked.forEach((method) => {
    const key = JSON.stringify([
      method.admissionGroup,
      method.examName,
      method.trackName,
      method.englishMethod,
      method.ratios.korean,
      method.ratios.math,
      method.ratios.english,
      method.ratios.inquiry,
      method.ratioLabels,
    ]);
    if (!uniqueRows.has(key)) uniqueRows.set(key, method);
  });
  return [...uniqueRows.values()].slice(0, 1);
}

function historicalExamMatches(score: ScoreRow, method: MethodView) {
  const scoreExam = normalize(score.exam ?? score.a ?? '');
  const methodExam = normalize(method.examName);
  const scoreVariant = generalExamVariant(scoreExam);
  const methodVariant = generalExamVariant(methodExam);
  if (scoreVariant !== null && methodVariant !== null) return scoreVariant === methodVariant;
  return true;
}

function generalExamVariant(value: string) {
  if (!/일반/.test(value)) return null;
  if (/일반(?:학생|전형)?(?:Ⅱ|ⅱ|2)|일반2전형/.test(value)) return 2;
  if (/일반(?:학생|전형)?(?:Ⅲ|ⅲ|3)|일반3전형/.test(value)) return 3;
  if (/일반(?:학생|전형)?(?:Ⅳ|ⅳ|4)|일반4전형/.test(value)) return 4;
  return 1;
}

function scoreMethodRank(score: ScoreRow, method: MethodView) {
  const department = normalize(score.d);
  const target = normalize(method.trackName);
  if (target.includes('의예과제외')) return /의예|의학/.test(department) ? 0 : 11;
  if (method.u === '가톨릭관동대') {
    const healthcareOrEducation = ['임상병리', '치위생', '작업치료', '국어교육', '지리교육', '영어교육', '역사교육', '수학교육', '컴퓨터교육'];
    const trinity = ['자율전공', '경영', '경찰', '사회복지', '조리외식', '항공교통물류', '미디어콘텐츠', '생명과학', '건축', '소프트웨어', '항공운항', '항공정비', '스포츠지도', '실용음악', '디자인'];
    if (healthcareOrEducation.some((key) => department.includes(key)) && /헬스케어|사범/.test(target)) return 12;
    if (trinity.some((key) => department.includes(key)) && target.includes('트리니티')) return 12;
  }
  const departmentKeys = [
    '의학', '의예', '치의예', '한의예', '약학', '간호', '임상병리', '치위생', '작업치료', '국어교육', '지리교육', '영어교육', '역사교육',
    '수학교육', '컴퓨터교육', '체육교육', '유아교육', '스포츠레저', '스포츠재활', '자율전공', '경영', '경찰',
    '사회복지', '조리외식', '항공교통물류', '미디어콘텐츠', '생명과학', '건축', '소프트웨어',
    '항공운항', '항공정비', '스포츠지도', '실용음악', '디자인',
  ];
  const targetDepartmentKeys = departmentKeys.filter((key) => target.includes(key));
  if (targetDepartmentKeys.some((key) => department.includes(key))) return 10;
  if (targetDepartmentKeys.length && !/전체|공통|전모집단위|인문|자연|공학|예체능|통합/.test(target)) return 0;
  return scoreTrackRank(score.t, method.trackName);
}

function departmentGroupRank(departmentName: string, methodTrackName: string) {
  const department = normalize(departmentName);
  const target = normalize(methodTrackName);
  const mappings: { target: RegExp; department: RegExp }[] = [
    { target: /인문대|인문계열/, department: /국어|문예|영어영문|철학|역사|어문|문화|언어|문학|종교/ },
    { target: /사회과학|사회계열/, department: /정치|행정|공공|문헌정보|미디어|언론|사회|심리|도시계획|부동산|아동|가족|복지|광고홍보/ },
    { target: /경영경제|경영대|상경/, department: /경영|경제|무역|회계|금융|통계|국제물류/ },
    { target: /사범|교육계열/, department: /교육과|유아교육|교육학/ },
    { target: /예체|예술|체육/, department: /미술|디자인|음악|성악|작곡|피아노|관현악|무용|체육|스포츠|연극|영화|공연|조형|회화|공예|사진|웹툰|만화|애니메이션/ },
    { target: /의약학|의학|의예|치의|한의|약학|수의|간호|보건|의료/, department: /의학|의예|치의|한의|약학|수의|간호|임상병리|물리치료|작업치료|치위생|방사선|응급구조|보건|의료/ },
    { target: /자연|공학|이공/, department: /공학|과학|수학|통계|물리|화학|생명|환경|컴퓨터|소프트웨어|ai|인공지능|데이터|반도체|전자|기계|건축|토목|항공|식품|에너지/ },
  ];
  return mappings.reduce((rank, mapping) => mapping.target.test(target) && mapping.department.test(department) ? rank + 1 : rank, 0);
}

function scoreTrackRank(scoreTrack: string, methodTrack: string) {
  const source = normalize(scoreTrack);
  const target = normalize(methodTrack);
  if (/전체|공통|전모집단위/.test(target)) return 2;
  if (!source) return 1;
  if (target.includes(source) || source.includes(target)) return 5;
  if (/인문/.test(source) && /인문|사회|경영|상경|어문|문과|언어중심/.test(target)) return 4;
  if (/자연/.test(source) && /자연|공학|이과|수리중심|의예|치의예|한의예|약학|간호|과학/.test(target)) return 4;
  if (/예체능/.test(source) && /예체|미술|음악|체육|디자인|연극|영화/.test(target)) return 4;
  return 0;
}

function scoreRulesForDisplay(score: ScoreView): (MethodView | null)[] {
  return score.ruleMatches.length ? score.ruleMatches.slice(0, 3) : [null];
}

function scoreStudentRecord(score: ScoreView) {
  const rule = score.ruleMatches[0];
  if (rule) return recordLabel(rule);
  if (score.sb === true) return '반영';
  if (score.sb === false) return '미반영';
  return '미기재';
}

function reflectedDomains(rule: MethodView) {
  const labels: [DomainKey, string][] = [
    ['korean', '국어'],
    ['math', '수학'],
    ['english', '영어'],
    ['inquiry', '탐구'],
  ];
  const domains = labels
    .filter(([domain]) => rule.ratios[domain] !== null || Boolean(rule.ratioLabels?.[domain]))
    .map(([, label]) => label);
  return domains.join(' / ') || '—';
}

function scoreMethodLabel(rule: MethodView, _score: Pick<ScoreView, 'displayGroup'>) {
  return `${rule.examName}, ${rule.trackName}, 영어 ${rule.englishMethod}`;
}

function highestRatioDomains(ratios: WeightSnapshot) {
  const entries: [string, number | null][] = [
    ['국어', ratios.korean],
    ['수학', ratios.math],
    ['영어', ratios.english],
    ['탐구', ratios.inquiry],
  ];
  const values = entries.map(([, value]) => value).filter((value): value is number => value !== null);
  if (!values.length) return '';
  const maximum = Math.max(...values);
  return entries.filter(([, value]) => value === maximum).map(([label]) => label).join('/');
}

function recordLabel(row: Pick<ProfileView, 'sb' | 'sbDetail'>) {
  const evaluation = studentRecordEvaluation(row);
  if (evaluation.mode === '정성평가' || evaluation.mode === '정량평가') {
    if (evaluation.rate !== null) return `${evaluation.mode} ${formatPlainNumber(evaluation.rate)}%`;
    if (/감점/.test(evaluation.detail)) return `${evaluation.mode} 감점`;
    return `${evaluation.mode} 비율 미기재`;
  }
  return evaluation.mode;
}

function studentRecordEvaluation(row: Pick<ProfileView, 'sb' | 'sbDetail'>) {
  if (row.sb === false) return { mode: '미반영', rate: null, detail: '미반영' } as const;
  if (row.sb !== true) return { mode: '미기재', rate: null, detail: row.sbDetail || '' } as const;

  const detail = (row.sbDetail || '').replace(/\s+/g, ' ').trim();
  const qualitative = /학생부종합|학생부평가|종합평가|서류평가|교과평가|학업충실도|정성/.test(detail);
  const broadRate = detail.match(/학생부\s*(?:교과|종합(?:평가)?|평가|출결)?\s*(\d+(?:\.\d+)?)\s*%/)?.[1]
    ?? detail.match(/(?:교과평가|학업충실도(?:평가)?|서류평가|종합평가)\s*(\d+(?:\.\d+)?)\s*%/)?.[1];
  let rate = broadRate ? Number(broadRate) : null;
  if (rate === null) {
    const componentRates = [...detail.matchAll(/(?:^|[,/+]\s*)(?:교과|출결)\s*(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
    if (componentRates.length) rate = Number(componentRates.reduce((sum, value) => sum + value, 0).toFixed(2));
  }
  return { mode: qualitative ? '정성평가' : '정량평가', rate, detail } as const;
}

function representativeMaximums(scores: ScoreRow[]) {
  const byUniversity = new Map<string, ScoreRow[]>();
  scores.forEach((row) => {
    if (row.y !== 2026) return;
    if (row.max === null) return;
    const rows = byUniversity.get(row.u) ?? [];
    rows.push(row);
    byUniversity.set(row.u, rows);
  });
  const result = new Map<string, number>();
  byUniversity.forEach((rows, university) => {
    const counts = new Map<number, number>();
    rows.filter((row) => row.max !== null).forEach((row) => {
      const maximum = row.max as number;
      counts.set(maximum, (counts.get(maximum) ?? 0) + 1);
    });
    const representative = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0];
    if (representative !== undefined) result.set(university, representative);
  });
  return result;
}

function sortRows<T>(rows: T[], sort: SortState, getters: Record<string, (row: T) => string | number | boolean | null | undefined>) {
  const getter = getters[sort.key];
  if (!getter) return rows;
  return [...rows].sort((left, right) => {
    const a = getter(left);
    const b = getter(right);
    if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : 1;
    if (b === null || b === undefined || b === '') return -1;
    const comparison = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'ko', { numeric: true });
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const escape = (value: string | number | boolean | null | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
