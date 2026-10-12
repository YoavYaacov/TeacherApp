// תובנות יזומות לדף הבית: חישוב בקוד בלבד, בלי קריאה למודל.
import type { AiContext, DB } from '../data/types';
import { activeStudents } from '../lib/domain';
import { groupEvents, movements, studentName } from './analytics';
import { heldEvents } from './analytics';

export interface Insight { id: string; text: string; ctx: AiContext; kind: 'docs' | 'grades' | 'drop' | 'practice' }
const LIMIT = 4;

export function computeInsights(db: DB, pendingDocs: { id: string; group_id: string | null }[], dismissed: Record<string, string>): Insight[] {
  const out: Insight[] = [];
  const byGroup = new Map<string, number>();
  for (const p of pendingDocs) if (p.group_id) byGroup.set(p.group_id, (byGroup.get(p.group_id) ?? 0) + 1);
  for (const g of db.study_groups.filter((x) => !x.archived_at)) {
    const n = byGroup.get(g.id) ?? 0;
    if (n > 0) out.push({ id: `docs:${g.id}:${n}`, kind: 'docs', text: `${g.name}: ${n} ${n === 1 ? 'שיעור ממתין' : 'שיעורים ממתינים'} לתיעוד`, ctx: { kind: 'group', group_id: g.id } });
    const evs = groupEvents(db, g), held = heldEvents(evs); const last = held[held.length - 1];
    if (last) {
      if (last.missing.length > 0) out.push({ id: `grades:${g.id}:${last.id}:${last.missing.length}`, kind: 'grades', text: `${g.name}: ל-${last.missing.length} תלמידים אין ציון ב"${last.title}"`, ctx: { kind: 'group', group_id: g.id } });
      if (last.avg !== null && last.n >= 3 && last.avg < 60) out.push({ id: `practice:${g.id}:${last.id}`, kind: 'practice', text: `${g.name}: ממוצע ${last.avg} ב"${last.title}". אולי כדאי תרגול נוסף`, ctx: { kind: 'group', group_id: g.id } });
      const drops = movements(evs, activeStudents(db, g.id).map((s) => s.id)).filter((m) => m.adjusted <= -15);
      if (drops.length) out.push({ id: `drop:${g.id}:${last.id}:${drops.map((d) => d.studentId).sort().join(',')}`, kind: 'drop', text: `${g.name}: ירידה ניכרת (מעבר לשינוי בכיתה) אצל ${drops.slice(0, 3).map((d) => studentName(db, d.studentId)).join(', ')}${drops.length > 3 ? ` ועוד ${drops.length - 3}` : ''}`, ctx: drops.length === 1 ? { kind: 'student', group_id: g.id, student_id: drops[0].studentId } : { kind: 'group', group_id: g.id } });
    }
  }
  return out.filter((i) => !dismissed[i.id]).slice(0, LIMIT);
}
