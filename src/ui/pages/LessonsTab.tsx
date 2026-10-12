import { useEffect, useRef, useState } from 'react';
import { Download, Plus, Trash2, XCircle } from 'lucide-react';
import { useStore } from '../../data/store';
import { Modal } from '../Modal';
import { createLessons, googleLinked, logOf } from '../../lib/lessons';
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
  const hasContent = !!(log && (log.topic || log.learned || log.homework || log.private_note));
  const persist = (patch: Partial<LessonLog> = {}) => {
    window.clearTimeout(timer.current);
    store.saveFast('lesson_logs', [{ calendar_event_id: lesson.id, ...latest.current, completion, ...patch }]);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); window.clearTimeout(timer.current); latest.current = { ...f, [k]: v }; timer.current = window.setTimeout(() => persist(), 700); };
  const field = (k: keyof typeof f, label: string) => (
    <label className="field">{label}
      <textarea className="input" rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} onBlur={() => persist()} />
    </label>);
  return (
    <div className="lesson-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{fmtDay(lesson.start_at)} · {fmtTime(lesson.start_at)}</strong>
        <span className="row">
          {lesson.status === 'cancelled' ? <span className="badge">{lesson.source === 'google' ? 'בוטל ב-Google' : 'בוטל'}</span>
            : <span className="mini-seg big" role="group" aria-label="סטטוס תיעוד">
              {([['pending', 'ממתין'], ['done', 'מתועד'], ['not_needed', 'אין צורך']] as const).map(([id, l]) =>
                <button key={id} aria-pressed={completion === id} onClick={() => persist({ completion: id })}>{l}</button>)}
            </span>}
        </span>
      </div>
      {(lesson.status !== 'cancelled' || hasContent) && (<>
        <div className="form two">{field('topic', 'נושא')}{field('learned', 'מה נלמד')}{field('homework', 'שיעורי בית')}{field('private_note', 'הערה פרטית (לא מוצגת בייצוא)')}</div>
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
        {!googleLinked(store.db) && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />הוסף שיעור</button>}
      </div>
      <div className="grid">
        <section className="card"><h2>שיעורים עתידיים</h2>
          {future.length === 0 ? <p className="muted">אין שיעורים עתידיים</p> :
            <ul className="list">{future.map((l) => (
              <li key={l.id}><span>{fmtDay(l.start_at)} <span className="muted">{fmtTime(l.start_at)}–{fmtTime(l.end_at)}</span></span>
                {l.source === 'google' ? <span className="muted">נערך ב-Google</span> : <button className="btn sm" aria-label="ניהול שיעור" onClick={() => setManage(l)}>ניהול</button>}</li>))}</ul>}
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
