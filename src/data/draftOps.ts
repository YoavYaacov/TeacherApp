import type { DB } from './types';
export type ApplyMode = 'fill' | 'append' | 'replace';
const clean = (v: unknown) => { const s = typeof v === 'string' ? v.trim() : ''; return s || null; };

/** מקביל ל-ai_apply_draft ב-SQL (0005), למצב מקומי. טהור; זורק שגיאה בעברית כמו השרת. */
export function applyDraftLocal(db: DB, draftId: string, payload: Record<string, unknown> | null, mode: ApplyMode): DB {
  const d = db.ai_drafts.find((x) => x.id === draftId);
  if (!d) throw new Error('הטיוטה לא נמצאה');
  if (d.status !== 'pending') throw new Error('הטיוטה כבר טופלה');
  if (!['fill', 'append', 'replace'].includes(mode)) throw new Error('מצב שמירה לא חוקי');
  const pl = payload ?? d.payload; const now = new Date().toISOString();
  let next: DB = db;
  if (d.kind === 'lesson_log') {
    const ev = db.calendar_events.find((e) => e.id === d.target.calendar_event_id);
    if (!ev) throw new Error('השיעור לא נמצא');
    if (!ev.group_id) throw new Error('השיעור אינו משויך לקבוצה');
    const cur = db.lesson_logs.find((l) => l.calendar_event_id === ev.id);
    const merged: Record<string, string | null> = {};
    for (const f of ['topic', 'learned', 'homework'] as const) {
      const v = clean(pl[f]); if (v && v.length > 6000) throw new Error(`השדה ${f} ארוך מדי`);
      const old = clean(cur?.[f]);
      merged[f] = v === null ? old : old === null ? v : mode === 'replace' ? v : mode === 'append' ? `${old}\n\n${v}` : old;
    }
    const row = { calendar_event_id: ev.id, topic: merged.topic, learned: merged.learned, homework: merged.homework, private_note: cur?.private_note ?? null, completion: pl.mark_done === true || pl.mark_done === 'true' ? 'done' as const : cur?.completion ?? 'pending' as const };
    next = { ...db, lesson_logs: cur ? db.lesson_logs.map((l) => (l.calendar_event_id === ev.id ? row : l)) : [...db.lesson_logs, row] };
  } else {
    const t = d.target; const text = clean(pl.text);
    if (!text) throw new Error('ההערכה ריקה'); if (text.length > 4000) throw new Error('ההערכה ארוכה מדי');
    if (!db.enrollments.some((e) => e.group_id === t.group_id && e.student_id === t.student_id)) throw new Error('התלמיד אינו רשום בקבוצה');
    const cur = db.ai_evaluations.find((e) => e.group_id === t.group_id && e.student_id === t.student_id && e.period === t.period);
    const params = (pl.params as Record<string, unknown> | undefined) ?? {};
    next = { ...db, ai_evaluations: cur ? db.ai_evaluations.map((e) => (e === cur ? { ...e, text, params, updated_at: now } : e)) : [...db.ai_evaluations, { id: crypto.randomUUID(), group_id: t.group_id, student_id: t.student_id, period: t.period as 'h1' | 'h2' | 'annual', text, params, created_at: now, updated_at: now }] };
  }
  return { ...next, ai_drafts: next.ai_drafts.map((x) => (x.id === draftId ? { ...x, status: 'applied' as const, applied_at: now, payload: pl } : x)) };
}
