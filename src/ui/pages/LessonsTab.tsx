import { useEffect, useRef, useState } from 'react';
import { Check, Download, Plus, Trash2, XCircle } from 'lucide-react';
import { useStore } from '../../data/store';
import { Modal } from '../Modal';
import { createLessons, logOf } from '../../lib/lessons';
import { download, fmtDay, fmtDate, fmtTime, iso, toCSV } from '../../lib/util';
import type { CalendarEvent, LessonLog, StudyGroup } from '../../data/types';

export function AddLessonModal({ groups, groupId, onClose }: { groups: StudyGroup[]; groupId?: string; onClose: () => void }) {
  const store = useStore();
  const [gid, setGid] = useState(groupId ?? groups[0]?.id ?? '');
  const [date, setDate] = useState(iso(new Date()));
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('08:45');
  const [weekly, setWeekly] = useState(false);
  const [until, setUntil] = useState('');
  const g = groups.find((x) => x.id === gid);
  const bad = !g || !date || end <= start || (weekly && (!until || until < date));
  return (
    <Modal title="הוספת שיעור" onClose={onClose}>
      <div className="form">
        {!groupId && <label className="field">קבוצה<select className="input" value={gid} onChange={(e) => setGid(e.target.value)}>{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label className="field">תאריך<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="row"><label className="field">התחלה<input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field">סיום<input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
        <label className="row"><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> חזרה שבועית</label>
        {weekly && <label className="field">עד תאריך<input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>}
        <p className="muted">הלוח הפנימי הוא זמני; בהמשך אפשר לחבר Google Calendar.</p>
        <button className="btn primary" disabled={bad} onClick={async () => { await createLessons(store, gid, g!.name, date, start, end, weekly ? until : undefined); onClose(); }}>הוסף</button>
      </div>
    </Modal>
  );
}

function LessonCard({ lesson }: { lesson: CalendarEvent }) {
  const store = useStore();
  const log = logOf(store, lesson.id);
  const [f, setF] = useState({ topic: log?.topic ?? '', learned: log?.learned ?? '', homework: log?.homework ?? '', private_note: log?.private_note ?? '' });
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(f); latest.current = f;
  const completion = log?.completion ?? 'pending';
  const persist = (patch: Partial<LessonLog> = {}) => {
    window.clearTimeout(timer.current);
    store.saveFast('lesson_logs', [{ calendar_event_id: lesson.id, ...latest.current, completion, ...patch }]);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); window.clearTimeout(timer.current); latest.current = { ...f, [k]: v }; timer.current = window.setTimeout(() => persist(), 700); };
  const field = (k: keyof typeof f, label: string, multiline = false) => (
    <label className="field">{label}
      {multiline ? <textarea className="input" rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} onBlur={() => persist()} />
        : <input className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} onBlur={() => persist()} />}
    </label>);
  return (
    <div className="lesson-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{fmtDay(lesson.start_at)} · {fmtTime(lesson.start_at)}</strong>
        <span className="row">
          {lesson.status === 'cancelled' ? <span className="badge">בוטל</span>
            : completion === 'pending' ? <span className="badge warn">ממתין לתיעוד</span>
            : <span className="badge ok">{completion === 'done' ? 'מתועד' : 'אין צורך בתיעוד'}</span>}
        </span>
      </div>
      {lesson.status !== 'cancelled' && (<>
        <div className="form two">{field('topic', 'נושא')}{field('learned', 'מה נלמד', true)}{field('homework', 'שיעורי בית', true)}{field('private_note', 'הערה פרטית (לא מוצגת בייצוא)', true)}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => persist({ completion: 'done' })}><Check size={14} aria-hidden />סמן כמתועד</button>
          <button className="btn sm" onClick={() => persist({ completion: 'not_needed' })}>אין צורך בתיעוד</button>
          {completion !== 'pending' && <button className="btn sm" onClick={() => persist({ completion: 'pending' })}>החזר לממתין</button>}
        </div>
      </>)}
    </div>
  );
}

export function LessonsTab({ group }: { group: StudyGroup }) {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [manage, setManage] = useState<CalendarEvent | null>(null);
  const now = new Date();
  const mine = store.db.calendar_events.filter((l) => l.group_id === group.id).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const future = mine.filter((l) => new Date(l.end_at) >= now && l.status === 'confirmed');
  const past = mine.filter((l) => new Date(l.end_at) < now).reverse();
  const shown = showAll ? past : past.slice(0, 3);
  const exportCsv = () => download(`שיעורים-${group.name}.csv`, toCSV([
    ['תאריך', 'שעה', 'נושא', 'מה נלמד', 'שיעורי בית', 'סטטוס'],
    ...mine.filter((l) => l.status === 'confirmed').map((l) => { const g = logOf(store, l.id); return [fmtDate(l.start_at), fmtTime(l.start_at), g?.topic, g?.learned, g?.homework, g?.completion ?? 'pending']; }),
  ]));
  return (
    <>
      <div className="toolbar"><span className="spacer" />
        <button className="icon-btn" aria-label="ייצוא תיעוד" title="ייצוא תיעוד CSV" onClick={exportCsv}><Download size={18} /></button>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />הוסף שיעור</button>
      </div>
      <div className="grid">
        <section className="card"><h2>שיעורים עתידיים</h2>
          {future.length === 0 ? <p className="muted">אין שיעורים עתידיים</p> :
            <ul className="list">{future.map((l) => (
              <li key={l.id}><span>{fmtDay(l.start_at)} <span className="muted">{fmtTime(l.start_at)}–{fmtTime(l.end_at)}</span></span>
                <button className="btn sm" aria-label="ניהול שיעור" onClick={() => setManage(l)}>ניהול</button></li>))}</ul>}
        </section>
        <section className="card span2"><h2>שיעורים קודמים ותיעוד</h2>
          {past.length === 0 && <p className="muted">עדיין אין שיעורים קודמים</p>}
          {shown.map((l) => <LessonCard key={l.id} lesson={l} />)}
          {past.length > 3 && <button className="btn sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'הצג פחות' : `הצג את כל ${past.length} השיעורים`}</button>}
        </section>
      </div>
      {adding && <AddLessonModal groups={[group]} groupId={group.id} onClose={() => setAdding(false)} />}
      {manage && <Modal title="ניהול שיעור" onClose={() => setManage(null)}>
        <p>{fmtDay(manage.start_at)} · {fmtTime(manage.start_at)}</p>
        <div className="row">
          <button className="btn" onClick={async () => { await store.patch('calendar_events', manage.id, { status: 'cancelled' }); setManage(null); }}><XCircle size={16} aria-hidden />בטל שיעור</button>
          <button className="btn" onClick={async () => { if (confirm('למחוק את השיעור לצמיתות?')) { await store.del('lesson_logs', { calendar_event_id: manage.id }); await store.del('calendar_events', { id: manage.id }); setManage(null); } }}><Trash2 size={16} aria-hidden />מחק</button>
        </div></Modal>}
    </>
  );
}
