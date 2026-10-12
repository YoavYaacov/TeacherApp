import { useState } from 'react';
import { ChevronLeft, ChevronRight, Cloud, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { fmtTime, iso } from '../../lib/util';
import { AddLessonModal } from './LessonsTab';
import { googleLinked, needsDoc } from '../../lib/lessons';
import { Modal } from '../Modal';
import type { CalendarEvent, StudyGroup } from '../../data/types';

/** שיוך אירוע שאינו משויך לקבוצה. הכלל נשמר לפי כותרת, ומשפיע גם על ייבואים עתידיים. */
function AssignModal({ ev, groups, onClose }: { ev: CalendarEvent; groups: StudyGroup[]; onClose: () => void }) {
  const store = useStore();
  const [gid, setGid] = useState('');
  const [all, setAll] = useState(true);
  const save = async () => {
    const same = store.db.calendar_events.filter((e) => !e.group_id && (e.id === ev.id || (all && e.title === ev.title)));
    for (const e of same) await store.patch('calendar_events', e.id, { group_id: gid });
    if (all) {
      const cur = store.db.user_settings[0];
      const rules = { ...((cur?.prefs?.titleRules as Record<string, string>) ?? {}), [ev.title]: gid };
      await store.save('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), titleRules: rules } }]);
    }
    onClose();
  };
  return <Modal title="שיוך אירוע לקבוצה" onClose={onClose}>
    <p><strong>{ev.title}</strong><br /><span className="muted">{new Date(ev.start_at).toLocaleDateString('he-IL')} {ev.all_day ? '' : fmtTime(ev.start_at)}</span></p>
    <p className="muted">אירוע שלא משויך לקבוצה אינו מופיע בתיעוד שיעורים. אם זה לא שיעור (למשל ישיבה), אפשר להשאיר אותו כך.</p>
    <div className="form">
      <label className="field">קבוצה<select className="input" value={gid} onChange={(e) => setGid(e.target.value)}><option value="">בחר קבוצה…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label className="row"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> החל על כל האירועים בשם הזה (כולל ייבואים עתידיים)</label>
      <button className="btn primary" disabled={!gid} onClick={save}>שייך</button>
    </div>
  </Modal>;
}

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
  const name = (id: string | null, title: string) => store.db.study_groups.find((g) => g.id === id)?.name ?? title;
  const [assign, setAssign] = useState<CalendarEvent | null>(null);
  return (
    <>
      <div className="pagehead"><div><h1>יומן כללי</h1><p className="muted"><Cloud size={14} aria-hidden /> {googleLinked(store.db) ? 'האירועים מיובאים מ-Google Calendar. יוצרים ומשנים אותם שם.' : 'לוח שיעורים פנימי. אפשר לחבר Google Calendar בהגדרות.'}</p></div>
        {!googleLinked(store.db) && <button className="btn primary" disabled={groups.length === 0} onClick={() => setAdding(true)}><Plus size={16} aria-hidden />הוסף שיעור</button>}</div>
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
              <button key={l.id} className={`lesson-chip${l.status === 'cancelled' ? ' cancelled' : ''}`} onClick={() => (l.group_id ? go('groups', l.group_id) : setAssign(l))} title={!l.group_id ? 'לחץ כדי לשייך לקבוצה' : undefined}>
                <strong>{l.all_day ? 'כל היום' : fmtTime(l.start_at)}</strong> {name(l.group_id, l.title)} {l.status === 'cancelled' && '(בוטל)'}{needsDoc(store, l.id, l.end_at, l.status, new Date(), l.group_id) && <span className="dot" title="ממתין לתיעוד" />}
              </button>))}
          </section>);
      })}</div>
      {assign && <AssignModal ev={assign} groups={groups} onClose={() => setAssign(null)} />}
      {adding && <AddLessonModal groups={groups} onClose={() => setAdding(false)} />}
    </>
  );
}
