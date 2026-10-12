import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { fmtDay, fmtTime } from '../../lib/util';
import { needsDoc } from '../../lib/lessons';
import { activeStudents, shownEvents } from '../../lib/domain';
import { Sparkles, X } from 'lucide-react';
import { computeInsights } from '../../ai/insights';
import { getDismissed } from '../../ai/prefs';

export function HomePage() {
  const store = useStore();
  const { db } = store;
  const { go, openAssistant } = useNav();
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב';
  const groupName = (id: string | null, title?: string) => db.study_groups.find((g) => g.id === id)?.name ?? title ?? 'שיעור';
  const groups = db.study_groups.filter((g) => !g.archived_at);
  // שיעורים קרובים: מה שמתרחש עכשיו ועד שבוע קדימה
  const horizon = new Date(now); horizon.setDate(horizon.getDate() + 7);
  const shown = shownEvents(db);
  const upcoming = shown.filter((l) => l.status === 'confirmed' && !l.all_day && new Date(l.end_at) >= now && new Date(l.start_at) <= horizon).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const pending = shown.filter((l) => needsDoc(store, l.id, l.end_at, l.status, now, l.group_id)).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const activeCount = new Set(groups.flatMap((g) => activeStudents(db, g.id).map((x) => x.id))).size;
  const weekCount = upcoming.length;
  const dismissed = getDismissed(db);
  const insights = computeInsights(db, pending, dismissed);
  const dismiss = (id: string) => { const cur = db.user_settings[0]; store.saveFast('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), aiDismissed: { ...dismissed, [id]: new Date().toISOString() } } }]); };
  const dayLabel = (s: string) => { const d = new Date(s); const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000); return diff === 0 ? 'היום' : diff === 1 ? 'מחר' : fmtDay(s); };
  return (
    <>
      <div className="pagehead"><div><h1>{greet}</h1><p className="muted">{now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
      <div className="stats" aria-label="סיכום">
        <div className="stat"><strong>{activeCount}</strong><span>תלמידים פעילים</span></div>
        <div className="stat"><strong>{pending.length}</strong><span>תיעודים ממתינים</span></div>
        <div className="stat"><strong>{groups.length}</strong><span>קבוצות פעילות</span></div>
        <div className="stat"><strong>{weekCount}</strong><span>שיעורים בשבוע הקרוב</span></div>
      </div>
      {insights.length > 0 && <section className="card insights" aria-label="תובנות"><h2><Sparkles size={16} aria-hidden /> תובנות</h2>
        <ul className="list">{insights.map((i) => <li key={i.id} className="insight"><span>{i.text}</span>
          <span className="insight-actions"><button className="linklike" onClick={() => openAssistant(i.ctx)}>פתח בעוזר</button><button className="iconbtn" aria-label="הסתר תובנה" onClick={() => dismiss(i.id)}><X size={14} aria-hidden /></button></span></li>)}</ul></section>}
      <div className="grid">
        <section className="card"><h2>השיעורים הקרובים</h2>
          {upcoming.length === 0 ? <p className="muted">אין שיעורים בשבוע הקרוב</p> :
            <ul className="list">{upcoming.slice(0, 8).map((l) => (
              <li key={l.id}><button className="rowbtn" disabled={!l.group_id} onClick={() => go('groups', l.group_id)}>
                <span>{groupName(l.group_id, l.title)}</span>
                <span className="muted">{dayLabel(l.start_at)} · <bdi dir="ltr">{fmtTime(l.start_at)}–{fmtTime(l.end_at)}</bdi></span></button></li>))}</ul>}
          {upcoming.length > 8 && <p className="muted"><button className="linklike" onClick={() => go('calendar')}>לכל השיעורים ביומן</button></p>}
        </section>
        <section className="card"><h2>תיעודים ממתינים{pending.length > 0 && <span className="muted"> · {pending.length}</span>}</h2>
          {pending.length === 0 ? <p className="muted">הכול מתועד</p> :
            <ul className="list">{pending.slice(0, 6).map((l) => (
              <li key={l.id}><button className="rowbtn" onClick={() => go('groups', l.group_id)}>
                <span>{groupName(l.group_id, l.title)}</span><span className="muted">{fmtDay(l.start_at)}</span></button></li>))}</ul>}
          {pending.length > 6 && <p className="muted">ועוד {pending.length - 6}. כולם מופיעים בלשונית השיעורים של הקבוצה.</p>}
        </section>
        <section className="card"><h2>קבוצות</h2>
          {groups.length === 0 ? <><p className="muted">עדיין אין קבוצות.</p><button className="btn primary" onClick={() => go('groups')}>יצירת קבוצה</button></> :
            <ul className="list">{groups.map((g) => (
              <li key={g.id}><button className="rowbtn" onClick={() => go('groups', g.id)}>
                <span>{g.name}</span><span className="muted">{activeStudents(db, g.id).length} תלמידים</span></button></li>))}</ul>}
        </section>
      </div>
    </>
  );
}
