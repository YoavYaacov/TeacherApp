import type { Store } from '../data/store';
import { iso } from './util';

export async function createLessons(store: Store, groupId: string, title: string, date: string, start: string, end: string, repeatUntil?: string) {
  const rows = [];
  const first = new Date(`${date}T00:00`);
  const last = repeatUntil ? new Date(`${repeatUntil}T00:00`) : first;
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 7)) {
    const day = iso(d);
    rows.push({ group_id: groupId, title, start_at: new Date(`${day}T${start}`).toISOString(), end_at: new Date(`${day}T${end}`).toISOString(), status: 'confirmed' as const, source: 'internal' as const });
    if (rows.length >= 60) break;
  }
  await store.save('calendar_events', rows);
  return rows.length;
}

export function logOf(store: Store, id: string) {
  return store.db.lesson_logs.find((l) => l.calendar_event_id === id);
}
export const needsDoc = (store: Store, id: string, endAt: string, status: string, now = new Date(), groupId: string | null = 'x') =>
  !!groupId && status === 'confirmed' && new Date(endAt) < now && (logOf(store, id)?.completion ?? 'pending') === 'pending';
