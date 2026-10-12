import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { fmtDay, fmtTime } from '../../lib/util';
import { needsDoc } from '../../lib/lessons';
import { activeStudents } from '../../lib/domain';

export function HomePage() {
  const store = useStore();
  const { db } = store;
  const { go } = useNav();
  const now = new Date();
  const todayStr = now.toDateString();
  const groupName = (id: string | null) => db.study_groups.find((g) => g.id === id)?.name ?? 'שיעור';
  const todays = db.calendar_events.filter((l) => l.status === 'confirmed' && new Date(l.start_at).toDateString() === todayStr).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const pending = db.calendar_events.filter((l) => needsDoc(store, l.id, l.end_at, l.status, now)).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const groups = db.study_groups.filter((g) => !g.archived_at);
  return (
    <>
      <h1>בית</h1>
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
            <ul className="list">{pending.slice(0, 8).map((l) => (
              <li key={l.id}><span>{groupName(l.group_id)} · {fmtDay(l.start_at)}</span>
                <button className="btn sm" onClick={() => go('groups', l.group_id)}>תעד</button></li>))}</ul>}
          {pending.length > 8 && <p className="muted">ועוד {pending.length - 8}…</p>}
        </section>
        <section className="card"><h2>קבוצות פעילות</h2>
          {groups.length === 0 ? <p className="muted">עדיין אין קבוצות. התחל מיצירת קבוצת לימוד.</p> :
            <ul className="list">{groups.map((g) => (
              <li key={g.id}><span>{g.name} <span className="muted">· {activeStudents(db, g.id).length} תלמידים</span></span>
                <button className="btn sm" onClick={() => go('groups', g.id)}>פתח</button></li>))}</ul>}
        </section>
        <section className="card"><h2>פעולות מהירות</h2>
          <div className="row"><button className="btn primary" onClick={() => go('groups')}>קבוצות לימוד</button><button className="btn" onClick={() => go('calendar')}>הוסף שיעור ליומן</button></div>
        </section>
      </div>
    </>
  );
}
