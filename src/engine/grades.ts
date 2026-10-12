import {
  type AnnualResult,
  type AssessmentEvent,
  type Category,
  type CategoryResult,
  type ConfigIssue,
  DEFAULT_ROUNDING,
  type EventGrades,
  type FinalGrade,
  type FinalStatus,
  type GradeCell,
  type MakeupPolicy,
  type RoundingPolicy,
  type TermConfig,
  type TermResult,
} from './types';

const EPS = 1e-9;

/** עיגול half-up בטוח מפני שגיאות float (למשל 1.005). */
export function roundHalfUp(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((x + Math.sign(x) * EPS) * f) / f;
}

const isScore = (c: GradeCell | undefined): c is { kind: 'score'; value: number } =>
  !!c && c.kind === 'score';

export function isValidScore(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 100;
}

/**
 * פתרון מועד א'/ב' לציון קובע אחד.
 * - רק א' תקף -> א'; רק ב' תקף -> ב'. (מועד ב' חסר => משתמשים בא' הזמין)
 * - שניהם תקפים -> לפי מדיניות: הגבוה | האחרון (ב') | ממוצע.
 * - אף אחד אינו ציון -> null (לעולם לא ממוצע עם ריק).
 */
export function resolveEventScore(g: EventGrades | undefined, eventPolicy: MakeupPolicy): number | null {
  if (!g) return null;
  const a = isScore(g.a) ? g.a.value : null;
  const b = isScore(g.b) ? g.b.value : null;
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  const policy = g.policyOverride ?? eventPolicy;
  switch (policy) {
    case 'best':
      return Math.max(a, b);
    case 'latest':
      return b;
    case 'average':
      return (a + b) / 2;
  }
}

/** משקלים אפקטיביים (באחוזים לא מנורמלים) של אירועים בקטגוריה. */
function eventWeight(cat: Category, ev: AssessmentEvent): number {
  return cat.weightMode === 'equal' ? 1 : (ev.weight ?? 0);
}

/**
 * בחירת האירוע להשמטה — דטרמיניסטי:
 * 1. הציון האפקטיבי הנמוך ביותר.
 * 2. תיקו: המשקל הגבוה יותר מושמט (השפעת הציון הנמוך הנשאר קטנה יותר).
 * 3. תיקו: התאריך המוקדם יותר.
 * 4. תיקו: id לקסיקוגרפי.
 * (החלטה מוצעת — מוצגת כסוגיה פתוחה ב-PLAN.md)
 */
function pickDropped(
  cat: Category,
  valid: { ev: AssessmentEvent; score: number }[],
): string | null {
  if (valid.length < 2) return null; // אם יש רק ציון תקף אחד — לא משמיטים
  const sorted = [...valid].sort((x, y) => {
    if (Math.abs(x.score - y.score) > EPS) return x.score - y.score;
    const wx = eventWeight(cat, x.ev);
    const wy = eventWeight(cat, y.ev);
    if (Math.abs(wx - wy) > EPS) return wy - wx;
    if (x.ev.date !== y.ev.date) return x.ev.date < y.ev.date ? -1 : 1;
    return x.ev.id < y.ev.id ? -1 : x.ev.id > y.ev.id ? 1 : 0;
  });
  return sorted[0].ev.id;
}

export function computeCategory(
  cat: Category,
  grades: Record<string, EventGrades | undefined>,
): CategoryResult {
  const active = cat.events.filter((e) => !e.cancelled);
  const valid: { ev: AssessmentEvent; score: number }[] = [];
  const missing: string[] = [];
  for (const ev of active) {
    const s = resolveEventScore(grades[ev.id], ev.makeupPolicy);
    if (s === null) missing.push(ev.id);
    else valid.push({ ev, score: s });
  }
  const effective: Record<string, number> = {};
  valid.forEach((v) => (effective[v.ev.id] = v.score));

  const droppedEventId = cat.dropLowest ? pickDropped(cat, valid) : null;
  const kept = valid.filter((v) => v.ev.id !== droppedEventId);
  if (kept.length === 0) {
    return { categoryId: cat.id, average: null, droppedEventId, missingEventIds: missing, effective };
  }
  // נרמול זמני של המשקלים בין הציונים התקפים שנשארו
  const wSum = kept.reduce((s, v) => s + eventWeight(cat, v.ev), 0);
  let avg: number;
  if (wSum <= EPS) {
    // כל המשקלים 0 (הגדרה שגויה) — נפילה לממוצע פשוט; ולידציה תדווח על כך
    avg = kept.reduce((s, v) => s + v.score, 0) / kept.length;
  } else {
    avg = kept.reduce((s, v) => s + v.score * eventWeight(cat, v.ev), 0) / wSum;
  }
  return { categoryId: cat.id, average: avg, droppedEventId, missingEventIds: missing, effective };
}

/**
 * ממוצע ביניים של תלמיד במחצית. קטגוריות ללא נתונים מוחרגות והמשקל מנורמל מחדש
 * (ברירת מחדל מוצעת), והתוצאה מסומנת partial.
 */
export function computeTerm(
  config: TermConfig,
  grades: Record<string, EventGrades | undefined>,
  rounding: RoundingPolicy = DEFAULT_ROUNDING,
): TermResult {
  const categories = config.categories.map((c) => computeCategory(c, grades));
  const withData = categories
    .map((r, i) => ({ r, w: config.categories[i].weight }))
    .filter((x) => x.r.average !== null);
  const emptyCategoryIds = categories.filter((r) => r.average === null).map((r) => r.categoryId);
  const anyMissing = categories.some((r) => r.missingEventIds.length > 0);

  if (withData.length === 0) {
    return { calculated: null, calculatedRounded: null, partial: anyMissing || emptyCategoryIds.length > 0, categories, emptyCategoryIds };
  }
  const wSum = withData.reduce((s, x) => s + x.w, 0);
  const calculated =
    wSum <= EPS
      ? withData.reduce((s, x) => s + (x.r.average as number), 0) / withData.length
      : withData.reduce((s, x) => s + (x.r.average as number) * x.w, 0) / wSum;
  return {
    calculated,
    calculatedRounded: roundHalfUp(calculated, rounding.calcDecimals),
    partial: anyMissing || emptyCategoryIds.length > 0,
    categories,
    emptyCategoryIds,
  };
}

/** ולידציה של הגדרות; לעולם לא מנרמלת בשקט. */
export function validateTermConfig(config: TermConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const total = config.categories.reduce((s, c) => s + c.weight, 0);
  if (config.categories.some((c) => c.weight < 0)) {
    issues.push({ code: 'NEGATIVE_WEIGHT', message: 'משקל קטגוריה שלילי' });
  }
  if (config.categories.length > 0 && !near(total, 100)) {
    issues.push({ code: 'CATEGORY_WEIGHTS_SUM', message: `משקלי הקטגוריות מסתכמים ב-${total}% ולא ב-100%` });
  }
  for (const c of config.categories) {
    if (c.weightMode === 'equal') continue;
    const evs = c.events.filter((e) => !e.cancelled);
    if (evs.some((e) => e.weight === null)) {
      issues.push({ code: 'EVENT_WEIGHT_MISSING', categoryId: c.id, message: `בקטגוריה "${c.name}" יש אירוע ללא משקל` });
      continue;
    }
    if (evs.some((e) => (e.weight as number) < 0)) {
      issues.push({ code: 'NEGATIVE_WEIGHT', categoryId: c.id, message: `בקטגוריה "${c.name}" יש משקל שלילי` });
    }
    const s = evs.reduce((a, e) => a + (e.weight as number), 0);
    if (evs.length > 0 && !near(s, 100)) {
      issues.push({ code: 'EVENT_WEIGHTS_SUM', categoryId: c.id, message: `משקלי האירועים ב"${c.name}" מסתכמים ב-${s}% ולא ב-100%` });
    }
  }
  return issues;
}

export function validateAnnualWeights(w1: number, w2: number): ConfigIssue[] {
  return Math.abs(w1 + w2 - 100) < 1e-6
    ? []
    : [{ code: 'ANNUAL_WEIGHTS_SUM', message: `משקלי המחציות מסתכמים ב-${w1 + w2}% ולא ב-100%` }];
}

/**
 * מצב ציון סופי: ערך שמור (מאושר/override) + האם התיישן ביחס לחישוב הנוכחי.
 * שינוי במקור לעולם לא דורס ערך שמור.
 */
export function finalStatus(
  stored: FinalGrade | null | undefined,
  currentCalculated: number | null,
  rounding: RoundingPolicy = DEFAULT_ROUNDING,
): FinalStatus {
  if (!stored) return { value: null, source: null, stale: false };
  const r = (x: number | null) => (x === null ? null : roundHalfUp(x, rounding.calcDecimals));
  const stale = r(stored.basisCalculated) !== r(currentCalculated);
  return { value: stored.value, source: stored.source, stale };
}

/** יצירת רשומת אישור של הציון המחושב כסופי (מעוגל לפי מדיניות). */
export function approveCalculated(
  calculated: number,
  rounding: RoundingPolicy = DEFAULT_ROUNDING,
): FinalGrade {
  return { value: roundHalfUp(calculated, rounding.finalDecimals), source: 'approved', basisCalculated: calculated };
}

export function manualOverride(value: number, basisCalculated: number | null): FinalGrade {
  if (!isValidScore(value)) throw new RangeError('ציון חייב להיות בין 0 ל-100');
  return { value, source: 'override', basisCalculated };
}

/**
 * ציון שנתי מחושב מציונים סופיים של שתי המחציות בלבד.
 * אם אחת חסרה — אין ציון שנתי (null) ומוחזר אילו מחציות חסרות. לא ממציאים ערך.
 */
export function computeAnnual(
  term1Final: number | null,
  term2Final: number | null,
  w1 = 50,
  w2 = 50,
  rounding: RoundingPolicy = DEFAULT_ROUNDING,
): AnnualResult {
  const missingTerms: (1 | 2)[] = [];
  if (term1Final === null) missingTerms.push(1);
  if (term2Final === null) missingTerms.push(2);
  if (missingTerms.length > 0 || Math.abs(w1 + w2 - 100) > 1e-6) {
    return { calculated: null, calculatedRounded: null, missingTerms };
  }
  const calculated = ((term1Final as number) * w1 + (term2Final as number) * w2) / 100;
  return { calculated, calculatedRounded: roundHalfUp(calculated, rounding.calcDecimals), missingTerms };
}
