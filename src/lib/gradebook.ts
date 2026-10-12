import type { DB, AssessmentEventRow } from '../data/types';
import type { Category, EventGrades, GradeCell, TermConfig, FinalGrade } from '../engine/types';

export function termConfig(db: DB, groupId: string, term: 1 | 2): TermConfig {
  const cats = db.grade_categories.filter((c) => c.group_id === groupId && c.term === term).sort((a, b) => a.sort_order - b.sort_order);
  const categories: Category[] = cats.map((c) => ({
    id: c.id, name: c.name, weight: Number(c.weight), weightMode: c.event_weight_mode, dropLowest: c.drop_lowest,
    events: db.assessment_events.filter((e) => e.category_id === c.id).sort((a, b) => a.sort_order - b.sort_order).map((e) => ({
      id: e.id, weight: e.weight === null ? null : Number(e.weight), date: e.event_date ?? '', makeupPolicy: e.makeup_policy, cancelled: !!e.cancelled_at,
    })),
  }));
  return { categories };
}

const cell = (g?: { status: string; score: number | null }): GradeCell =>
  !g ? { kind: 'empty' } : g.status === 'score' ? { kind: 'score', value: Number(g.score) } : g.status === 'exempt' ? { kind: 'exempt' } : { kind: 'absent' };

export function studentGrades(db: DB, studentId: string, events: AssessmentEventRow[]): Record<string, EventGrades> {
  const out: Record<string, EventGrades> = {};
  for (const e of events) {
    const a = db.grades.find((g) => g.event_id === e.id && g.student_id === studentId && g.attempt === 1);
    const b = db.grades.find((g) => g.event_id === e.id && g.student_id === studentId && g.attempt === 2);
    const o = db.grade_policy_overrides.find((x) => x.event_id === e.id && x.student_id === studentId);
    out[e.id] = { a: cell(a), b: b ? cell(b) : undefined, policyOverride: o?.policy };
  }
  return out;
}

export function storedFinal(db: DB, groupId: string, studentId: string, period: 'h1' | 'h2' | 'annual'): FinalGrade | null {
  const f = db.final_grades.find((x) => x.group_id === groupId && x.student_id === studentId && x.period === period);
  return f ? { value: Number(f.value), source: f.source, basisCalculated: f.basis_calculated === null ? null : Number(f.basis_calculated) } : null;
}
export const cellText = (c?: { status: string; score: number | null }) => (!c ? '' : c.status === 'score' ? String(Number(c.score)) : c.status === 'exempt' ? 'פ' : 'ל');
export function parseCell(txt: string): { status: 'score' | 'exempt' | 'absent'; score: number | null } | 'empty' | null {
  const t = txt.trim();
  if (t === '') return 'empty';
  if (t === 'פ') return { status: 'exempt', score: null };
  if (t === 'ל') return { status: 'absent', score: null };
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? { status: 'score', score: n } : null;
}
