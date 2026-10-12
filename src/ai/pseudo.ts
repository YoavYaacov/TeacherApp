// כינויי תלמידים: מה שיוצא ל-Gemini מכיל "ST-17" במקום שם. המיפוי חי רק בדפדפן ולא נשלח לשום מקום.
// הכינוי קבוע בתוך שיחה (לפי מזהה השיחה) ושונה בין שיחות, כך שאי אפשר לחבר בין שיחות.
import type { Student } from '../data/types';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])', PRE = '([והבכלמש]{0,2})';

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
export const fullName = (s: Pick<Student, 'first_name' | 'last_name'>) => `${s.first_name} ${s.last_name}`.trim();

export interface AliasMap {
  alias(id: string): string;
  idOf(alias: string): string | null;
  /** טקסט עם שמות => טקסט עם כינויים (שם דו-משמעי הופך ל-[שם]) */
  pseudonymize(text: string): string;
  /** טקסט עם כינויים => טקסט עם שמות מלאים (להצגה בדפדפן בלבד) */
  restore(text: string): string;
  /** עובר על ערכי מחרוזת בתוך אובייקט */
  deep<T>(v: T): T;
}

export function makeAliasMap(students: Student[], seed: string): AliasMap {
  const sorted = [...students].sort((a, b) => a.id.localeCompare(b.id));
  const nums = sorted.map((_, i) => i + 10);
  const r = rng(seed);
  for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  const toAlias = new Map(sorted.map((s, i) => [s.id, `ST-${nums[i]}`]));
  const byAlias = new Map([...toAlias].map(([id, a]) => [a, id]));
  const byId = new Map(students.map((s) => [s.id, s]));

  // כינוי לשמות מלאים (שני הסדרים) וכינוי לשם בודד רק אם הוא חד-משמעי
  const full: { re: RegExp; to: string }[] = [];
  const tokenOwners = new Map<string, Set<string>>();
  for (const s of students) {
    const f = s.first_name.trim(), l = s.last_name.trim(), a = toAlias.get(s.id)!;
    if (f && l) for (const n of [`${f} ${l}`, `${l} ${f}`]) full.push({ re: new RegExp(`${B}${PRE}${esc(n)}${E}`, 'gu'), to: a });
    for (const t of [f, l].flatMap((x) => x.split(/\s+/)).filter((x) => x.length >= 2)) { if (!tokenOwners.has(t)) tokenOwners.set(t, new Set()); tokenOwners.get(t)!.add(s.id); }
  }
  full.sort((x, y) => y.re.source.length - x.re.source.length);
  const toks = [...tokenOwners].sort((x, y) => y[0].length - x[0].length).map(([t, owners]) => ({ re: new RegExp(`${B}${PRE}${esc(t)}${E}`, 'gu'), to: owners.size === 1 ? toAlias.get([...owners][0])! : '[שם]' }));
  const pseudonymize = (text: string) => {
    let out = text;
    for (const x of full) out = out.replace(x.re, (_m, pre: string) => `${pre ?? ''}${x.to}`);
    for (const x of toks) out = out.replace(x.re, (_m, pre: string) => `${pre ?? ''}${x.to}`);
    return out;
  };
  const restore = (text: string) => text.replace(/ST-(\d+)/g, (m) => { const id = byAlias.get(m); const s = id ? byId.get(id) : null; return s ? fullName(s) : m; });
  const deep = <T,>(v: T): T => (typeof v === 'string' ? pseudonymize(v) : Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, deep(x)])) : v) as T;
  return { alias: (id) => toAlias.get(id) ?? '[תלמיד]', idOf: (a) => byAlias.get(a.trim()) ?? null, pseudonymize, restore, deep };
}

/** ניחוש מגדר משם פרטי לצורך הצעה בלבד; המשתמש מאשר. ללא ניחוש = null. */
export function guessGender(first: string): 'm' | 'f' | null {
  const n = first.trim().split(/\s+/)[0];
  if (!n) return null;
  const female = new Set(['שיר', 'נועם', 'יובל', 'גל', 'טל', 'ליאור', 'אור', 'מור', 'רות', 'דנה', 'מיכל', 'שירן', 'יעל', 'נועה', 'תמר', 'אביגיל', 'רחל', 'לילך', 'ספיר', 'עדי', 'נוי', 'אגם', 'ים']);
  const male = new Set(['אדם', 'דוד', 'יוסף', 'משה', 'רן', 'עומר', 'איתי', 'ירדן', 'נועם_', 'אורי', 'יונתן', 'דניאל', 'אריאל', 'רועי', 'עידו', 'אלון', 'תומר', 'ליאם']);
  const ambiguous = new Set(['שיר', 'נועם', 'יובל', 'גל', 'טל', 'ליאור', 'אור', 'מור', 'עדי', 'נוי', 'אגם', 'ים', 'ספיר', 'ירדן', 'דניאל', 'אריאל']);
  if (ambiguous.has(n)) return null;
  if (male.has(n)) return 'm';
  if (female.has(n) || /[הת]$/.test(n) && !/^(אליה|יהודה|עמיחי|חנניה|אשר)$/.test(n)) return 'f';
  return 'm';
}
