import { useEffect, useState } from 'react';
import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { fmtDate, fmtDay, fmtTime, hebrewDate } from '../../lib/util';
import { needsDoc } from '../../lib/lessons';
import { activeStudents, shownEvents } from '../../lib/domain';
import { remainingThisWeek } from '../../lib/week';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { LessonDocModal } from './LessonsTab';
import { OvertimeCard } from './OvertimeCard';
import { Modal } from '../Modal';

/** שעה נוכחית שמתעדכנת בעצמה (כל דקה ובחזרה ללשונית), כדי שהמונים יישארו נכונים גם כשהאפליקציה פתוחה זמן רב */
function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [ms]);
  return now;
}
const lessonWhen = (s: string) => `${new Date(s).toLocaleDateString('he-IL', { weekday: 'long' })} · ${fmtDate(s)} · ${fmtTime(s)}`;

export function HomePage() {
  const store = useStore();
  const { db } = store;
  const { go } = useNav();
  const now = useNow();
  const [docId, setDocId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const hour = now.getHours();
  const [greet, emoji] = hour < 5 || hour >= 22 ? ['לילה טוב', '🌙'] : hour < 12 ? ['בוקר טוב', '☀️'] : hour < 18 ? ['צהריים טובים', '🌤️'] : ['ערב טוב', '🌇'];
  const groupName = (id: string | null, title?: string) => db.study_groups.find((g) => g.id === id)?.name ?? title ?? 'שיעור';
  const groups = db.study_groups.filter((g) => !g.archived_at);
  const shown = shownEvents(db);
  // שיעורים קרובים: מה שנותר מעכשיו ועד סוף השבוע (שבת בחצות, שעון ישראל)
  const upcoming = remainingThisWeek(shown.filter((l) => l.status === 'confirmed' && !l.all_day), now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  // שיעורים שהתקיימו ועוד לא תועדו (לא עתידיים, לא "אין צורך", לא מבוטלים), מהחדש לישן
  const pending = shown.filter((l) => needsDoc(store, l.id, l.end_at, l.status, now, l.group_id)).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const activeCount = new Set(groups.flatMap((g) => activeStudents(db, g.id).map((x) => x.id))).size;
  const weekCount = upcoming.length;
  const docEvent = docId ? db.calendar_events.find((e) => e.id === docId) : undefined;
  const pendingRow = (l: (typeof pending)[number]) => (
    <li key={l.id} className="pending-item">
      <span className="meta"><strong>{groupName(l.group_id, l.title)}</strong><span className="muted">{lessonWhen(l.start_at)}</span></span>
      <button className="btn sm primary" onClick={() => { setShowAll(false); setDocId(l.id); }}>תעד שיעור</button>
    </li>);
  const dayLabel = (s: string) => { const d = new Date(s); const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000); return diff === 0 ? 'היום' : diff === 1 ? 'מחר' : fmtDay(s); };
  return (
    <>
      <div className="pagehead"><div><h1>{greet}, יואב <span aria-hidden>{emoji}</span></h1><p className="muted">{now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} · {hebrewDate(now)}</p></div></div>
      <div className="stats" aria-label="סיכום">
        <div className="stat"><strong>{activeCount}</strong><span>תלמידים פעילים</span></div>
        <div className="stat"><strong>{pending.length}</strong><span>תיעודים ממתינים</span></div>
        <div className="stat"><strong>{groups.length}</strong><span>קבוצות פעילות</span></div>
        <div className="stat"><strong>{weekCount}</strong><span>שיעורים שנותרו השבוע</span><small>עד סוף השבוע</small></div>
      </div>
      <div className="home-top">
        <section className={`card pending-card${pending.length === 0 ? ' compact' : ''}`} aria-label="תיעודי שיעורים ממתינים">
          <h2><ClipboardList size={18} aria-hidden /> תיעודי שיעורים ממתינים{pending.length > 0 && <span className="muted"> · {pending.length}</span>}</h2>
          {pending.length === 0 ? <p className="pending-ok"><CheckCircle2 size={18} aria-hidden /> כל השיעורים מתועדים. כל הכבוד!</p> : <>
            <ul className="pending-list">{pending.slice(0, 5).map(pendingRow)}</ul>
            {pending.length > 5 && <p style={{ margin: '12px 0 0' }}><button className="btn sm" onClick={() => setShowAll(true)}>הצג הכול ({pending.length})</button></p>}
          </>}
        </section>
        <OvertimeCard />
      </div>
      <div className="grid">
        <section className="card"><h2>שיעורים עד סוף השבוע</h2>
          {upcoming.length === 0 ? <p className="muted">לא נותרו שיעורים עד סוף השבוע</p> :
            <ul className="list">{upcoming.slice(0, 8).map((l) => (
              <li key={l.id}><button className="rowbtn" disabled={!l.group_id} onClick={() => go('groups', l.group_id)}>
                <span>{groupName(l.group_id, l.title)}</span>
                <span className="muted">{dayLabel(l.start_at)} · <bdi dir="ltr">{fmtTime(l.start_at)}–{fmtTime(l.end_at)}</bdi></span></button></li>))}</ul>}
          {upcoming.length > 8 && <p className="muted"><button className="linklike" onClick={() => go('calendar')}>לכל השיעורים ביומן</button></p>}
        </section>
        <section className="card"><h2>קבוצות</h2>
          {groups.length === 0 ? <><p className="muted">עדיין אין קבוצות.</p><button className="btn primary" onClick={() => go('groups')}>יצירת קבוצה</button></> :
            <ul className="list">{groups.map((g) => (
              <li key={g.id}><button className="rowbtn" onClick={() => go('groups', g.id)}>
                <span>{g.name}</span><span className="muted">{activeStudents(db, g.id).length} תלמידים</span></button></li>))}</ul>}
        </section>
      </div>
      {showAll && <Modal title="כל התיעודים הממתינים" onClose={() => setShowAll(false)} wide><ul className="pending-list">{pending.map(pendingRow)}</ul></Modal>}
      {docEvent && <LessonDocModal lesson={docEvent} groupName={groupName(docEvent.group_id, docEvent.title)} onClose={() => setDocId(null)} />}
    </>
  );
}
