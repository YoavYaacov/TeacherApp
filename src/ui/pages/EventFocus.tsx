import { SortTh, sortRows, useSort } from '../sort';
import { useState } from 'react';
import { Modal } from '../Modal';
import { useStore } from '../../data/store';
import { label } from '../../lib/domain';
import { hebSort } from '../../lib/util';
import type { Student, StudyGroup } from '../../data/types';
import { GradeInput, useGradeActions } from './GradeParts';

export function EventFocus({ eventId, students, onClose }: { group: StudyGroup; eventId: string; students: Student[]; onClose: () => void }) {
  const store = useStore();
  const { db } = store;
  const commit = useGradeActions();
  const ev = db.assessment_events.find((e) => e.id === eventId)!;
  const [q, setQ] = useState('');
  const sort = useSort<'name' | 'score' | 'b'>('name', { score: 'desc', b: 'desc' });
  const a = (sid: string) => db.grades.find((g) => g.event_id === eventId && g.student_id === sid && g.attempt === 1);
  const b = (sid: string) => db.grades.find((g) => g.event_id === eventId && g.student_id === sid && g.attempt === 2);
  const val = (sid: string) => { const g = a(sid); return g?.status === 'score' ? Number(g.score) : null; };
  const list = sortRows(students.filter((s) => label(s).includes(q.trim())), (s, k) => k === 'name' ? label(s) : k === 'score' ? val(s.id) : (b(s.id)?.status === 'score' ? Number(b(s.id)!.score) : null), sort.key, sort.dir, (x, y) => hebSort(label(x), label(y)));
  return (
    <Modal title={`הזנה מרוכזת: ${ev.title}`} onClose={onClose}>
      <div className="row" style={{ marginBottom: 12 }}>
        <span>כשיש שני מועדים, קובע:</span>
        <span className="mini-seg big" role="group" aria-label="מדיניות מועד ב׳">
          {([['best', 'הגבוה'], ['latest', 'האחרון'], ['average', 'ממוצע']] as const).map(([id, l]) => <button key={id} aria-pressed={ev.makeup_policy === id} onClick={() => store.patchFast('assessment_events', eventId, { makeup_policy: id })}>{l}</button>)}
        </span>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="input" aria-label="חיפוש" placeholder="חיפוש תלמיד" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="muted">מספר 0–100, ״פ״ פטור, ״ל״ לא נבחן. Enter עובר לשורה הבאה.</p>
      <table className="gb focus"><thead><tr><SortTh k="name" sort={sort} className="name">תלמיד</SortTh><SortTh k="score" sort={sort}>ציון</SortTh><SortTh k="b" sort={sort}>מועד ב׳</SortTh></tr></thead>
        <tbody>{list.map((s, i) => (
          <tr key={s.id}><td className="name">{label(s)}</td>
            <td><GradeInput cur={a(s.id)} r={i} c={0} att={1} label={`${label(s)} ציון`} onCommit={(t) => commit(s.id, eventId, 1, t)} /></td>
            <td><GradeInput cur={b(s.id)} r={i} c={1} att={2} label={`${label(s)} מועד ב׳`} onCommit={(t) => commit(s.id, eventId, 2, t)} /></td></tr>))}</tbody></table>
    </Modal>
  );
}
