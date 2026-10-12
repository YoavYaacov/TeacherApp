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
  const [sort, setSort] = useState<'name' | 'asc' | 'desc' | 'missing'>('name');
  const a = (sid: string) => db.grades.find((g) => g.event_id === eventId && g.student_id === sid && g.attempt === 1);
  const b = (sid: string) => db.grades.find((g) => g.event_id === eventId && g.student_id === sid && g.attempt === 2);
  const val = (sid: string) => { const g = a(sid); return g?.status === 'score' ? Number(g.score) : null; };
  const list = students.filter((s) => label(s).includes(q.trim())).sort((x, y) => {
    if (sort === 'asc' || sort === 'desc') { const vx = val(x.id), vy = val(y.id); if (vx === null && vy !== null) return 1; if (vy === null && vx !== null) return -1; if (vx !== null && vy !== null && vx !== vy) return sort === 'asc' ? vx - vy : vy - vx; }
    if (sort === 'missing') { const mx = a(x.id) ? 1 : 0, my = a(y.id) ? 1 : 0; if (mx !== my) return mx - my; }
    return hebSort(label(x), label(y));
  });
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
        <select className="input" aria-label="מיון" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="name">מיון: שם</option><option value="missing">חסרים קודם</option><option value="asc">ציון עולה</option><option value="desc">ציון יורד</option></select>
      </div>
      <p className="muted">מספר 0–100, ״פ״ פטור, ״ל״ לא נבחן. Enter עובר לשורה הבאה.</p>
      <table className="gb focus"><thead><tr><th className="name">תלמיד</th><th>ציון</th><th>מועד ב׳</th></tr></thead>
        <tbody>{list.map((s, i) => (
          <tr key={s.id}><td className="name">{label(s)}</td>
            <td><GradeInput cur={a(s.id)} r={i} c={0} att={1} label={`${label(s)} ציון`} onCommit={(t) => commit(s.id, eventId, 1, t)} /></td>
            <td><GradeInput cur={b(s.id)} r={i} c={1} att={2} label={`${label(s)} מועד ב׳`} onCommit={(t) => commit(s.id, eventId, 2, t)} /></td></tr>))}</tbody></table>
    </Modal>
  );
}
