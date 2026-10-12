import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { fmtDay, fmtTime } from '../../lib/util';
import { needsDoc } from '../../lib/lessons';
import { activeStudents } from '../../lib/domain';
import { lastFileBackup } from './BackupPanel';

export function HomePage() {
  const store = useStore();
  const { db } = store;
  const { go } = useNav();
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב';
  const groupName = (id: string | null) => db.study_groups.find((g) => g.id === id)?.name ?? 'שיעור';
  const todays = db.calendar_events.filter((l) => l.status === 'confirmed' && new Date(l.start_at).toDateString() === now.toDateString()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const pending = db.calendar_events.filter((l) => needsDoc(store, l.id, l.end_at, l.status, now)).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const groups = db.study_groups.filter((g) => !g.archived_at);
  const studentCount = new Set(groups.flatMap((g) => activeStudents(db, g.id).map((s) => s.id))).size;
  const lastBk = lastFileBackup(db);
  const hasData = db.students.length + db.study_groups.length > 0;
  const bkDays = lastBk ? Math.floor((now.getTime() - new Date(lastBk).getTime()) / 86400000) : null;
  const needBackup = hasData && (bkDays === null || bkDays >= 7);
  const stats = [
    { n: todays.length, l: 'שיעורים היום' },
    { n: pending.length, l: 'תיעודים ממתינים' },
    { n: groups.length, l: 'קבוצות פעילות' },
    { n: studentCount, l: 'תלמידים פעילים' },
  ];
  return (
    <>
      <div className="pagehead"><div><h1>{greet}</h1><p className="muted">{now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
      {needBackup && <div className="note-banner" role="note">{bkDays === null ? 'עדיין לא הורדת גיבוי לקובץ.' : `הגיבוי האחרון לקובץ היה לפני ${bkDays} ימים.`} מומלץ להוריד אחד: הגדרות &gt; גיבויים ונתונים. <button className="btn sm" onClick={() => go('settings')}>להגדרות</button></div>}
      <div className="stats">{stats.map((s) => <div key={s.l} className="stat"><strong>{s.n}</strong><span>{s.l}</span></div>)}</div>
      <div className="grid">
        <section className="card"><h2>שיעורי היום</h2>
          {todays.length === 0 ? <p className="muted">אין שיעורים היום</p> :
            <ul className="list">{todays.map((l) => (
              <li key={l.id}><span>{groupName(l.group_id)}</span>
                <span className="row"><span className="muted">{fmtTime(l.start_at)}–{fmtTime(l.end_at)}</span>
                  {l.group_id && <button className="btn sm" onClick={() => go('groups', l.group_id)}>פתח</button>}</span></li>))}</ul>}
        </section>
        <section className="card"><h2>תיעודים ממתינים</h2>
          {pending.length === 0 ? <p className="muted">הכול מתועד</p> :
            <ul className="list">{pending.slice(0, 6).map((l) => (
              <li key={l.id}><span>{groupName(l.group_id)} <span className="muted">· {fmtDay(l.start_at)}</span></span>
                <button className="btn sm" onClick={() => go('groups', l.group_id)}>תעד</button></li>))}</ul>}
          {pending.length > 6 && <p className="muted">ועוד {pending.length - 6}…</p>}
        </section>
        <section className="card"><h2>קבוצות</h2>
          {groups.length === 0 ? <p className="muted">עדיין אין קבוצות.</p> :
            <ul className="list">{groups.map((g) => (
              <li key={g.id}><span>{g.name} <span className="muted">· {activeStudents(db, g.id).length} תלמידים</span></span>
                <button className="btn sm" onClick={() => go('groups', g.id)}>פתח</button></li>))}</ul>}
          {groups.length === 0 && <button className="btn primary" onClick={() => go('groups')}>יצירת קבוצה</button>}
        </section>
      </div>
    </>
  );
}
