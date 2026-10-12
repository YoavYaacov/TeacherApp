import { describe, expect, it } from 'vitest';
import { findDuplicates } from './dedupe';

const ev = (id: string, source: 'internal' | 'google', start: string, group: string | null, status: 'confirmed' | 'cancelled' = 'confirmed') => ({ id, source, start_at: start, end_at: start, group_id: group, title: 't', status });
const log = (id: string, topic: string | null) => ({ calendar_event_id: id, topic, learned: null, homework: null, private_note: null, completion: 'pending' as const });

describe('findDuplicates', () => {
  it('matches same start + same group, or google without group', () => {
    const db = { calendar_events: [ev('i1', 'internal', '2026-10-13T05:00:00Z', 'g1'), ev('i2', 'internal', '2026-10-14T05:00:00Z', 'g1'), ev('g1e', 'google', '2026-10-13T05:00:00.000Z', null), ev('g2e', 'google', '2026-10-14T05:00:00Z', 'g2')], lesson_logs: [] } as never;
    const r = findDuplicates(db);
    expect(r.map((p) => [p.internal.id, p.google.id])).toEqual([['i1', 'g1e']]); // g2e שייך לקבוצה אחרת
  });
  it('one google event pairs once; cancelled ignored', () => {
    const db = { calendar_events: [ev('i1', 'internal', '2026-10-13T05:00:00Z', 'g1'), ev('i2', 'internal', '2026-10-13T05:00:00Z', 'g1'), ev('x', 'google', '2026-10-13T05:00:00Z', 'g1'), ev('y', 'google', '2026-10-13T05:00:00Z', 'g1', 'cancelled')], lesson_logs: [] } as never;
    expect(findDuplicates(db)).toHaveLength(1);
  });
  it('flags conflict when both have documentation', () => {
    const db = { calendar_events: [ev('i1', 'internal', '2026-10-13T05:00:00Z', 'g1'), ev('x', 'google', '2026-10-13T05:00:00Z', 'g1')], lesson_logs: [log('i1', 'א'), log('x', 'ב')] } as any;
    expect(findDuplicates(db)[0].conflict).toBe(true);
    const db2 = { calendar_events: db.calendar_events, lesson_logs: [log('i1', 'א')] } as never;
    expect(findDuplicates(db2)[0].conflict).toBe(false);
  });
});
