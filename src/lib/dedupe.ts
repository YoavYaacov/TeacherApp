import type { Store } from '../data/store';
import type { CalendarEvent, DB, LessonLog } from '../data/types';

export interface DupPair { internal: CalendarEvent; google: CalendarEvent; conflict: boolean }
const minute = (s: string) => Math.floor(new Date(s).getTime() / 60000);
const hasContent = (l?: LessonLog) => !!(l && (l.topic || l.learned || l.homework || l.private_note || l.completion !== 'pending'));

/** שיעור פנימי שקיים גם ב-Google: אותה שעת התחלה, ואותה קבוצה (או אירוע Google בלי קבוצה). כל אירוע משתתף בזוג אחד לכל היותר. */
export function findDuplicates(db: Pick<DB, 'calendar_events' | 'lesson_logs'>): DupPair[] {
  const googles = db.calendar_events.filter((e) => e.source === 'google' && e.status === 'confirmed');
  const used = new Set<string>();
  const out: DupPair[] = [];
  for (const i of db.calendar_events.filter((e) => e.source === 'internal' && e.status === 'confirmed' && e.group_id)) {
    const g = googles.find((x) => !used.has(x.id) && minute(x.start_at) === minute(i.start_at) && (x.group_id === i.group_id || !x.group_id));
    if (!g) continue;
    used.add(g.id);
    const li = db.lesson_logs.find((l) => l.calendar_event_id === i.id), lg = db.lesson_logs.find((l) => l.calendar_event_id === g.id);
    out.push({ internal: i, google: g, conflict: hasContent(li) && hasContent(lg) });
  }
  return out;
}

/** איחוד: התיעוד עובר לאירוע Google (נשמר לפני שהישן נמחק), ואז נמחק השיעור הפנימי הכפול. */
export async function mergePair(store: Store, p: DupPair) {
  if (p.conflict) throw new Error('בשני האירועים יש תיעוד');
  if (!p.google.group_id) await store.patch('calendar_events', p.google.id, { group_id: p.internal.group_id });
  const li = store.db.lesson_logs.find((l) => l.calendar_event_id === p.internal.id);
  if (li) {
    const lg = store.db.lesson_logs.find((l) => l.calendar_event_id === p.google.id);
    if (!hasContent(lg)) await store.save('lesson_logs', [{ ...li, calendar_event_id: p.google.id }]);
    await store.del('lesson_logs', { calendar_event_id: p.internal.id });
  }
  await store.del('calendar_events', { id: p.internal.id });
}
