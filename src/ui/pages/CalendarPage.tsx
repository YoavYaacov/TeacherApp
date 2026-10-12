import { useState } from 'react';
import { ChevronLeft, ChevronRight, Cloud, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { fmtTime, iso } from '../../lib/util';
import { AddLessonModal } from './LessonsTab';
import { needsDoc } from '../../lib/lessons';

const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }; // יום א׳
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function CalendarPage() {
  const store = useStore();
  const { go } = useNav();
  const [week, setWeek] = useState(startOfWeek(new Date()));
  const [adding, setAdding] = useState(false);
  const groups = store.db.study_groups.filter((g) => !g.archived_at);
  const hasSat = store.db.calendar_events.some((l) => { const d = new Date(l.start_at); return d.getDay() === 6 && iso(d) === iso(new Date(new Date(week).setDate(week.getDate() + 6))); });
  const days = Array.from({ length: hasSat ? 7 : 6 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; });
  const shift = (n: number) => { const d = new Date(week); d.setDate(d.getDate() + n * 7); setWeek(d); };
  const name = (id: string | null) => store.db.study_groups.find((g) => g.id === id)?.name ?? 'שיעור';
  return (
    <>
      <div className="pagehead"><div><h1>יומן כללי</h1><p className="muted"><Cloud size={14} aria-hidden /> לוח שיעורים פנימי; סנכרון עם Google Calendar יתווסף בהמשך.</p></div>
        <button className="btn primary" disabled={groups.length === 0} onClick={() => setAdding(true)}><Plus size={16} aria-hidden />הוסף שיעור</button></div>
      <div className="toolbar">
        <button className="btn sm" aria-label="שבוע קודם" onClick={() => shift(-1)}><ChevronRight size={16} /></button>
        <button className="btn sm" onClick={() => setWeek(startOfWeek(new Date()))}>השבוע</button>
        <button className="btn sm" aria-label="שבוע הבא" onClick={() => shift(1)}><ChevronLeft size={16} /></button>
        <strong>{days[0].toLocaleDateString('he-IL')} – {days[days.length - 1].toLocaleDateString('he-IL')}</strong>
      </div>
      <div className="weekgrid" style={{ ['--cols' as string]: days.length }}>{days.map((d, i) => {
        const items = store.db.calendar_events.filter((l) => iso(new Date(l.start_at)) === iso(d)).sort((a, b) => a.start_at.localeCompare(b.start_at));
        const isToday = iso(d) === iso(new Date());
        return (
          <section key={i} className={`card day${isToday ? ' today' : ''}`}>
            <h2>יום {DAYS[i]} <span className="muted">{d.getDate()}/{d.getMonth() + 1}</span></h2>
            {items.length === 0 && <p className="muted">—</p>}
            {items.map((l) => (
              <button key={l.id} className={`lesson-chip${l.status === 'cancelled' ? ' cancelled' : ''}`} onClick={() => l.group_id && go('groups', l.group_id)}>
                <strong>{fmtTime(l.start_at)}</strong> {name(l.group_id)} {l.status === 'cancelled' && '(בוטל)'}{needsDoc(store, l.id, l.end_at, l.status) && <span className="dot" title="ממתין לתיעוד" />}
              </button>))}
          </section>);
      })}</div>
      {adding && <AddLessonModal groups={groups} onClose={() => setAdding(false)} />}
    </>
  );
}
