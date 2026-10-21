import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Download, MinusCircle, Plus, Trash2, XCircle } from 'lucide-react';
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
        {!groupId && <label className="field fl"><span>קבוצה</span><select className="input" value={gid} onChange={(e) => setGid(e.target.value)}>{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label className="field fl"><span>תאריך</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="row"><label className="field fl"><span>התחלה</span><input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field fl"><span>סיום</span><input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
        <label className="row"><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> חזרה שבועית</label>
        {weekly && <label className="field fl"><span>עד תאריך</span><input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>}
        <p className="muted">הלוח הפנימי הוא זמני; בהמשך אפשר לחבר Google Calendar.</p>
        <button className="btn primary" disabled={bad} onClick={async () => { await createLessons(store, gid, g!.name, date, start, end, weekly ? until : undefined); onClose(); }}>הוסף</button>
      </div>
    </Modal>
  );
}

const COMPLETION_LABEL = { pending: 'לא תועד', done: 'תועד', not_needed: 'אין צורך' } as const;
/** תגית מצב תיעוד: צבע + אייקון + טקסט (המצב ברור גם בלי להסתמך על צבע) */
export function DocStatusBadge({ status, cancelled }: { status: LessonLog['completion']; cancelled?: boolean }) {
  if (cancelled) return <span className="doc-badge cancelled"><XCircle size={14} aria-hidden />בוטל</span>;
  const Icon = status === 'done' ? CheckCircle2 : status === 'pending' ? AlertTriangle : MinusCircle;
  return <span className={`doc-badge ${status}`}><Icon size={14} aria-hidden />{COMPLETION_LABEL[status]}</span>;
}

/** טופס תיעוד שיעור (משמש גם את הלשונית וגם את החלון ממסך הבית) */
export function LessonCard({ lesson, bare }: { lesson: CalendarEvent; bare?: boolean }) {
  const store = useStore();
  const log = logOf(store, lesson.id);
  const [f, setF] = useState({ topic: log?.topic ?? '', learned: log?.learned ?? '', homework: log?.homework ?? '', private_note: log?.private_note ?? '' });
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(f); latest.current = f;
  const stored = log?.completion ?? 'pending';
  const [completion, setCompletion] = useState(stored); // מוצג מיד, גם לפני שהשמירה המושהית הסתיימה
  const comp = useRef(stored);
  useEffect(() => { comp.current = stored; setCompletion(stored); }, [stored]); // שינוי חיצוני (למשל אישור טיוטת AI)
  // אם המשתמש נגע במתג ידנית, הסימון האוטומטי לא מתערב יותר בשיעור הזה
  const manual = useRef(false);
  const hasContent = !!(log && (log.topic || log.learned || log.homework || log.private_note));
  const persist = (patch: Partial<LessonLog> = {}) => {
    window.clearTimeout(timer.current);
    store.saveFast('lesson_logs', [{ calendar_event_id: lesson.id, ...latest.current, completion: comp.current, ...patch }]);
  };
  // יציאה מהחלון/מהשורה באמצע הקלדה: שומרים מיד במקום לאבד את השינוי האחרון
  const dirty = useRef(false);
  useEffect(() => () => { window.clearTimeout(timer.current); if (dirty.current) { dirty.current = false; store.saveFast('lesson_logs', [{ calendar_event_id: lesson.id, ...latest.current, completion: comp.current }]); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f, v: string) => {
    const next = { ...f, [k]: v };
    setF(next); latest.current = next; dirty.current = true;
    // תוכן משמעותי בשדה כלשהו מסמן "תועד" אוטומטית, רק משמצב "לא תועד" ורק אם לא נבחר מצב ידנית. מחיקת תוכן לא מחזירה.
    if (lesson.status === 'confirmed' && comp.current === 'pending' && !manual.current && v.trim()) { comp.current = 'done'; setCompletion('done'); }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { dirty.current = false; persist(); }, 700);
  };
  const field = (k: keyof typeof f, label: string) => (
    <label className="field">{label}
      <textarea className="input" rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} onBlur={() => { dirty.current = false; persist(); }} />
    </label>);
  return (
    <div className={bare ? undefined : 'lesson-card'}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{fmtDay(lesson.start_at)} · {fmtTime(lesson.start_at)}</strong>
        <span className="row">
          {lesson.status === 'cancelled' ? <span className="badge">{lesson.source === 'google' ? 'בוטל ב-Google' : 'בוטל'}</span>
            : <span className="mini-seg big" role="group" aria-label="סטטוס תיעוד">
              {(['pending', 'done', 'not_needed'] as const).map((id) =>
                <button key={id} aria-pressed={completion === id} onClick={() => { manual.current = true; comp.current = id; setCompletion(id); persist({ completion: id }); }}>{COMPLETION_LABEL[id]}</button>)}
            </span>}
        </span>
      </div>
      {(lesson.status !== 'cancelled' || hasContent) && (<>
        <div className="form two">{field('topic', 'נושא')}{field('learned', 'מה נלמד')}{field('homework', 'שיעורי בית')}{field('private_note', 'הערה פרטית (לא מוצגת בייצוא)')}</div>
      </>)}
    </div>
  );
}

/** חלון תיעוד שיעור בודד (מסך הבית) */
export function LessonDocModal({ lesson, groupName, onClose }: { lesson: CalendarEvent; groupName: string; onClose: () => void }) {
  return <Modal title={`תיעוד שיעור · ${groupName}`} onClose={onClose} wide><LessonCard lesson={lesson} bare /></Modal>;
}

const weekdayDate = (s: string) => `${new Date(s).toLocaleDateString('he-IL', { weekday: 'long' })} · ${fmtDate(s)} · ${fmtTime(s)}`;

export function LessonsTab({ group }: { group: StudyGroup }) {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null | undefined>(undefined); // undefined = ברירת מחדל (האחרון פתוח); null = הכול סגור
  const [manage, setManage] = useState<CalendarEvent | null>(null);
  const now = new Date();
  const mine = store.db.calendar_events.filter((l) => l.group_id === group.id).sort((a, b) => a.start_at.localeCompare(b.start_at));
  // שיעור שהתחיל כבר ניתן לתיעוד; שיעורים שממתינים לתיעוד תמיד מוצגים, גם אם הם ישנים
  const future = mine.filter((l) => new Date(l.start_at) > now && l.status === 'confirmed');
  const past = mine.filter((l) => new Date(l.start_at) <= now && (!l.all_day || l.status === 'confirmed')).reverse();
  const open = openId === undefined ? past[0]?.id ?? null : openId; // past ממוין מהחדש לישן
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
        <section className="card full"><h2>שיעורים קודמים ותיעוד</h2>
          {past.length === 0 && <p className="muted">עדיין אין שיעורים קודמים</p>}
          <div className="acc">
            {past.map((l) => {
              const isOpen = open === l.id;
              const st = logOf(store, l.id)?.completion ?? 'pending';
              return (
                <div key={l.id} className={`acc-item${isOpen ? ' open' : ''}`}>
                  <button className="acc-head" aria-expanded={isOpen} aria-controls={`acc-${l.id}`} onClick={() => setOpenId(isOpen ? null : l.id)}>
                    <span className="acc-title">{weekdayDate(l.start_at)}</span>
                    <DocStatusBadge status={st} cancelled={l.status === 'cancelled'} />
                    <ChevronDown size={18} className="acc-caret" aria-hidden />
                  </button>
                  {isOpen && <div className="acc-body" id={`acc-${l.id}`}><LessonCard lesson={l} bare /></div>}
                </div>);
            })}
          </div>
        </section>
        <section className="card"><h2>שיעורים עתידיים</h2>
          {future.length === 0 ? <p className="muted">אין שיעורים עתידיים</p> :
            <ul className="list">{future.map((l) => (
              <li key={l.id}><span>{fmtDay(l.start_at)} <bdi dir="ltr" className="muted">{fmtTime(l.start_at)}–{fmtTime(l.end_at)}</bdi></span>
                {l.source === 'google' ? <span className="muted">נערך ב-Google</span> : <button className="btn sm" aria-label="ניהול שיעור" onClick={() => setManage(l)}>ניהול</button>}</li>))}</ul>}
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
