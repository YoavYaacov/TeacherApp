// חישובי נתונים של העוזר: הכול בקוד רגיל (לא במודל). פונקציות טהורות מעל DB.
import type { DB, StudyGroup, Student } from '../data/types';
import { activeStudents, groupYear, activeTerm, label } from '../lib/domain';
import { storedFinal, studentGrades, termConfig } from '../lib/gradebook';
import { computeAnnual, computeTerm, roundHalfUp } from '../engine/grades';
import { PASS_MIN, STAR_MIN } from '../lib/gradebook';

export const r1 = (x: number | null) => (x === null ? null : roundHalfUp(x, 1));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface EventScores {
  id: string; title: string; term: 1 | 2; date: string | null; category: string;
  scores: Map<string, number>;       // studentId -> ציון אפקטיבי (מועד א׳/ב׳ לפי המדיניות)
  absent: Set<string>; exempt: Set<string>; missing: string[]; // missing: פעילים בלי ציון, בלי פטור/לא נבחן
  n: number; avg: number | null; median: number | null; min: number | null; max: number | null;
  dist: { fail: number; mid: number; good: number; star: number };
}
const bucket = (xs: number[]) => ({ fail: xs.filter((x) => x < PASS_MIN).length, mid: xs.filter((x) => x >= PASS_MIN && x < 80).length, good: xs.filter((x) => x >= 80 && x < STAR_MIN).length, star: xs.filter((x) => x >= STAR_MIN).length });

export function groupEvents(db: DB, group: StudyGroup, term?: 1 | 2): EventScores[] {
  const students = activeStudents(db, group.id);
  const out: EventScores[] = [];
  for (const t of (term ? [term] : [1, 2]) as (1 | 2)[]) {
    const cfg = termConfig(db, group.id, t);
    const all = db.assessment_events.filter((e) => e.group_id === group.id && e.term === t);
    const perStudent = new Map(students.map((s) => { const g = studentGrades(db, s.id, all); return [s.id, { g, r: computeTerm(cfg, g) }] as const; }));
    for (const c of cfg.categories) for (const e of c.events) {
      if (e.cancelled) continue;
      const row = all.find((x) => x.id === e.id)!;
      const scores = new Map<string, number>(), absent = new Set<string>(), exempt = new Set<string>(), missing: string[] = [];
      for (const s of students) {
        const p = perStudent.get(s.id)!;
        const eff = Object.assign({}, ...p.r.categories.map((x) => x.effective)) as Record<string, number>;
        const a = p.g[e.id]?.a;
        if (e.id in eff) scores.set(s.id, eff[e.id]);
        else if (a?.kind === 'exempt') exempt.add(s.id);
        else if (a?.kind === 'absent') absent.add(s.id);
        else missing.push(s.id);
      }
      const xs = [...scores.values()];
      out.push({ id: e.id, title: row.title, term: t, date: row.event_date, category: c.name, scores, absent, exempt, missing, n: xs.length, avg: r1(mean(xs)), median: r1(median(xs)), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null, dist: bucket(xs) });
    }
  }
  // סדר כרונולוגי: לפי תאריך אם קיים, אחרת לפי סדר הגדרה
  return out.sort((a, b) => a.term - b.term || (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}
/** אירועים שכבר "התקיימו": יש בהם לפחות ציון אחד */
export const heldEvents = (evs: EventScores[]) => evs.filter((e) => e.n > 0);

export interface StudentTerm { term: 1 | 2; calculated: number | null; partial: boolean; final: number | null; finalSource: 'approved' | 'override' | null }
export function studentTerms(db: DB, group: StudyGroup, studentId: string): StudentTerm[] {
  return ([1, 2] as const).map((t) => {
    const all = db.assessment_events.filter((e) => e.group_id === group.id && e.term === t);
    const r = computeTerm(termConfig(db, group.id, t), studentGrades(db, studentId, all));
    const f = storedFinal(db, group.id, studentId, t === 1 ? 'h1' : 'h2');
    return { term: t, calculated: r1(r.calculated), partial: r.partial, final: f?.value ?? null, finalSource: f?.source ?? null };
  });
}
export function studentAnnual(db: DB, group: StudyGroup, studentId: string) {
  const f1 = storedFinal(db, group.id, studentId, 'h1')?.value ?? null, f2 = storedFinal(db, group.id, studentId, 'h2')?.value ?? null;
  const a = computeAnnual(f1, f2, Number(group.annual_weight_h1), Number(group.annual_weight_h2));
  return { calculated: a.calculatedRounded, stored: storedFinal(db, group.id, studentId, 'annual')?.value ?? null };
}

export interface Movement { studentId: string; latest: number; prevAvg: number; delta: number; classDelta: number; adjusted: number; latestTitle: string }
/** שינוי של תלמיד: ציון המבחן האחרון מול ממוצע הציונים הקודמים שלו; מתוקן בשינוי של הכיתה בין אותם מבחנים (השוואה הוגנת בין מבחנים בקושי שונה). */
export function movements(evs: EventScores[], studentIds: string[]): Movement[] {
  const held = heldEvents(evs);
  if (held.length < 2) return [];
  const last = held[held.length - 1], prev = held.slice(0, -1);
  const out: Movement[] = [];
  for (const id of studentIds) {
    const l = last.scores.get(id); const ps = prev.map((e) => e.scores.get(id)).filter((x): x is number => x !== undefined);
    if (l === undefined || !ps.length) continue;
    // ממוצע הכיתה באותם מבחנים שבהם התלמיד נבחן (מאותם תנאים)
    const classPrev = mean(prev.filter((e) => e.scores.has(id)).map((e) => e.avg ?? 0)) ?? 0;
    const prevAvg = mean(ps)!;
    const delta = l - prevAvg, classDelta = (last.avg ?? 0) - classPrev;
    out.push({ studentId: id, latest: l, prevAvg: r1(prevAvg)!, delta: r1(delta)!, classDelta: r1(classDelta)!, adjusted: r1(delta - classDelta)!, latestTitle: last.title });
  }
  return out;
}

/** מגמה לתלמיד: שיפוע (נקודות למבחן) בקירוב ריבועים פחותים; דורש לפחות 3 ציונים */
export function trend(values: number[]): { slope: number | null; label: 'עלייה' | 'ירידה' | 'יציב' | 'אין מספיק נתונים' } {
  if (values.length < 3) return { slope: null, label: 'אין מספיק נתונים' };
  const n = values.length, xs = values.map((_, i) => i), mx = mean(xs)!, my = mean(values)!;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (values[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const total = slope * (n - 1);
  return { slope: r1(slope), label: total >= 6 ? 'עלייה' : total <= -6 ? 'ירידה' : 'יציב' };
}

export interface StudentProfile {
  student: Student; group: StudyGroup; terms: StudentTerm[]; annual: ReturnType<typeof studentAnnual>;
  assessments: { title: string; term: 1 | 2; date: string | null; category: string; score: number | null; status: 'score' | 'absent' | 'exempt' | 'missing'; classAvg: number | null; diff: number | null }[];
  trend: ReturnType<typeof trend>; move: Movement | null; missingCount: number;
  lessons: { topics: string[]; count: number };
}
export function studentProfile(db: DB, group: StudyGroup, studentId: string): StudentProfile | null {
  const student = db.students.find((s) => s.id === studentId); if (!student) return null;
  const evs = groupEvents(db, group);
  const assessments = evs.map((e) => {
    const sc = e.scores.get(studentId);
    const status = sc !== undefined ? 'score' as const : e.absent.has(studentId) ? 'absent' as const : e.exempt.has(studentId) ? 'exempt' as const : 'missing' as const;
    return { title: e.title, term: e.term, date: e.date, category: e.category, score: sc ?? null, status, classAvg: e.avg, diff: sc !== undefined && e.avg !== null ? r1(sc - e.avg) : null };
  });
  const held = heldEvents(evs);
  const vals = held.map((e) => e.scores.get(studentId)).filter((x): x is number => x !== undefined);
  const logs = db.calendar_events.filter((e) => e.group_id === group.id && e.status === 'confirmed' && !e.hidden);
  const topics = [...new Set(logs.map((e) => db.lesson_logs.find((l) => l.calendar_event_id === e.id)?.topic?.trim()).filter((t): t is string => !!t))];
  return {
    student, group, terms: studentTerms(db, group, studentId), annual: studentAnnual(db, group, studentId), assessments, trend: trend(vals),
    move: movements(evs, [studentId])[0] ?? null, missingCount: assessments.filter((a) => a.status === 'missing' && held.some((h) => h.title === a.title)).length,
    lessons: { topics: topics.slice(-8), count: logs.length },
  };
}

export interface ClassSummary {
  group: StudyGroup; term: 1 | 2; students: number; events: EventScores[];
  termCalc: Map<string, number>; avg: number | null; median: number | null; dist: { fail: number; mid: number; good: number; star: number };
  noGrades: string[]; movers: Movement[]; belowPass: string[];
}
export function classSummary(db: DB, group: StudyGroup, term?: 1 | 2): ClassSummary {
  const t = term ?? activeTerm(groupYear(db, group));
  const studs = activeStudents(db, group.id);
  const evs = groupEvents(db, group, t);
  const termCalc = new Map<string, number>();
  for (const s of studs) { const v = studentTerms(db, group, s.id)[t - 1].calculated; if (v !== null) termCalc.set(s.id, v); }
  const xs = [...termCalc.values()];
  return { group, term: t, students: studs.length, events: evs, termCalc, avg: r1(mean(xs)), median: r1(median(xs)), dist: bucket(xs), noGrades: studs.filter((s) => !termCalc.has(s.id)).map((s) => s.id), movers: movements(evs, studs.map((s) => s.id)), belowPass: studs.filter((s) => (termCalc.get(s.id) ?? 100) < PASS_MIN).map((s) => s.id) };
}

export const studentName = (db: DB, id: string) => { const s = db.students.find((x) => x.id === id); return s ? label(s) : 'תלמיד'; };
