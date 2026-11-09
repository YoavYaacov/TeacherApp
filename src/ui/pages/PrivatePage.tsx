import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { uid } from '../../data/localRepo';
import { shownEvents } from '../../lib/domain';
import { israelParts } from '../../lib/week';
import { DAY_NAMES, DAY_SHORT, WINDOW, durLabel, fmtMin, isPlaced, overlap, readPlan, schoolBlocks, spanOf, stats, type PlanItem, type PrivatePlan, type Span } from '../../lib/privatePlan';
import { AvailabilityModal, ItemModal } from './PrivateModals';

const PPM = 0.95; // פיקסלים לדקה
const useNow = (ms = 60000) => { const [n, setN] = useState(() => new Date()); useEffect(() => { const t = window.setInterval(() => setN(new Date()), ms); const v = () => { if (!document.hidden) setN(new Date()); }; document.addEventListener('visibilitychange', v); return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', v); }; }, [ms]); return n; };
const useMedia = (q: string) => { const [m, setM] = useState(() => window.matchMedia(q).matches); useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]); return m; };

type Modal = null | { kind: 'item'; id?: string; preset?: { day: number; start: number } } | { kind: 'avail' };

/** מערכת שעות שבועית קבועה: בית ספר (מהיומן), שיעורים פרטיים קבועים, משבצות פנויות ושעות שאינן זמינות. */
export function PrivatePage() {
  const store = useStore();
  const now = useNow();
  const cur = store.db.user_settings[0];
  const plan = useMemo(() => readPlan(cur?.prefs), [cur?.prefs]);
  const hourKey = Math.floor(now.getTime() / 3600000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const school = useMemo(() => schoolBlocks(shownEvents(store.db), new Date(hourKey * 3600000)), [store.db.calendar_events, store.db.study_groups, hourKey]);
  const st = stats(plan, school);
  const narrow = useMedia('(max-width: 820px)');
  const today = israelParts(now).wd;
  const [sel, setSel] = useState(today);
  const [modal, setModal] = useState<Modal>(null);
  const save = (next: PrivatePlan) => store.saveFast('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), privatePlan: next } }]);

  // טווח השעות המוצג: 08:00–22:00, ומתרחב אם יש משהו מחוצה לו
  const all: Span[] = [...Object.values(school).flat(), ...plan.items.filter(isPlaced).map(spanOf), ...Object.values(plan.avail).flat().map((s) => ({ start: s, end: s + WINDOW }))];
  const from = Math.min(480, Math.floor(Math.min(...all.map((s) => s.start), 480) / 60) * 60);
  const to = Math.min(24 * 60, Math.max(22 * 60, Math.ceil(Math.max(...all.map((s) => s.end), 0) / 60) * 60));
  const waiting = plan.items.filter((i) => !isPlaced(i));
  const days = narrow ? [sel] : [0, 1, 2, 3, 4, 5, 6];
  const noSchool = Object.values(school).every((a) => a.length === 0);

  return (
    <>
      <div className="pagehead">
        <div><h1>שיעורים פרטיים</h1><p className="muted">מערכת שבועית קבועה: בית ספר ושיעורים פרטיים במפה אחת.</p></div>
        <div className="row">
          <button className="btn" onClick={() => setModal({ kind: 'avail' })}><CalendarClock size={16} aria-hidden />זמינות</button>
          <button className="btn primary" onClick={() => setModal({ kind: 'item' })}><Plus size={16} aria-hidden />הוסף תלמיד</button>
        </div>
      </div>

      <div className="pv-stats" aria-label="סיכום">
        <div className="pv-stat"><strong>{st.students}</strong><span>תלמידים קבועים</span></div>
        <div className="pv-stat"><strong>{st.weekly}</strong><span>שיעורים בשבוע</span></div>
        <div className="pv-stat"><strong>{st.waiting}</strong><span>ממתינים לשיבוץ</span></div>
        <div className="pv-stat"><strong>{st.free}</strong><span>משבצות פנויות</span></div>
      </div>

      {narrow && (
        <div className="pv-days" role="tablist" aria-label="יום בשבוע">
          {DAY_NAMES.map((_, d) => (
            <button key={d} role="tab" aria-selected={sel === d} className={`pv-day${d === today ? ' today' : ''}`} onClick={() => setSel(d)}>
              <span>{DAY_SHORT[d]}</span><small>{plan.items.filter((i) => i.day === d && i.start !== null).length || ''}</small>
            </button>
          ))}
        </div>
      )}
      {narrow && <Agenda day={sel} plan={plan} school={school} />}

      <div className="card flush pv-wrap">
        <div className="pv-grid" style={{ ['--cols' as string]: days.length } as CSSProperties}>
          <div className="pv-corner" />
          {days.map((d) => <div key={d} className={`pv-head${d === today ? ' today' : ''}`}>{DAY_NAMES[d]}</div>)}
          <div className="pv-axis" style={{ height: (to - from) * PPM }}>
            {Array.from({ length: (to - from) / 60 }, (_, i) => <span key={i} style={{ top: i * 60 * PPM }}>{fmtMin(from + i * 60)}</span>)}
          </div>
          {days.map((d) => (
            <Column key={d} day={d} from={from} to={to} plan={plan} school={school[d] ?? []} today={d === today}
              onFree={(start) => setModal({ kind: 'item', preset: { day: d, start } })} onItem={(id) => setModal({ kind: 'item', id })} />
          ))}
        </div>
        {noSchool && <p className="muted pv-note">שעות בית הספר יופיעו כשיהיו ביומן המסונכרן לפחות שני שיעורים באותה שעה באותו יום בשבוע.</p>}
      </div>

      <div className="pv-legend" aria-label="מקרא">
        <span><i className="sw school" />בית ספר</span><span><i className="sw lesson" />שיעור פרטי</span><span><i className="sw lesson opt" />אופציונלי</span><span><i className="sw free" />פנוי</span><span><i className="sw off" />לא זמין</span>
      </div>

      <section className="card pv-wait" aria-label="ממתינים לשיבוץ">
        <h2>ממתינים לשיבוץ</h2>
        {waiting.length === 0 ? <p className="muted">אין תלמידים שממתינים לשיבוץ.</p> : (
          <ul className="pv-waitlist">
            {waiting.map((i) => (
              <li key={i.id}>
                <div><strong>{i.name}</strong> <span className="muted">· {durLabel(i.dur)}</span>{i.note && <p className="muted" style={{ margin: '2px 0 0' }}>{i.note}</p>}</div>
                <button className="btn sm" onClick={() => setModal({ kind: 'item', id: i.id })}><Pencil size={14} aria-hidden />שבץ / ערוך</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal?.kind === 'item' && <ItemModal plan={plan} school={school} id={modal.id} preset={modal.preset} onSave={(p) => { save(p); setModal(null); }} onClose={() => setModal(null)} newId={uid} />}
      {modal?.kind === 'avail' && <AvailabilityModal plan={plan} onSave={(p) => { save(p); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
}

function Agenda({ day, plan, school }: { day: number; plan: PrivatePlan; school: Record<number, Span[]> }) {
  const rows = [
    ...(school[day] ?? []).map((s) => ({ s: s.start, t: `${fmtMin(s.start)}–${fmtMin(s.end)}`, label: 'בית ספר', cls: 'school' })),
    ...plan.items.filter((i) => i.day === day && i.start !== null).map((i) => ({ s: i.start!, t: `${fmtMin(i.start!)}–${fmtMin(i.start! + i.dur)}`, label: `${i.name}${i.kind === 'optional' ? ' (אופציונלי)' : ''}`, cls: 'lesson' })),
  ].sort((a, b) => a.s - b.s);
  return (
    <ul className="pv-agenda" aria-label={`סדר היום: ${DAY_NAMES[day]}`}>
      {rows.length === 0 ? <li className="muted">אין שיעורים ביום הזה.</li> : rows.map((r, i) => <li key={i} className={r.cls}><b>{r.t}</b><span>{r.label}</span></li>)}
    </ul>
  );
}

function Column({ day, from, to, plan, school, today, onFree, onItem }: { day: number; from: number; to: number; plan: PrivatePlan; school: Span[]; today: boolean; onFree: (start: number) => void; onItem: (id: string) => void }) {
  const top = (m: number) => (m - from) * PPM;
  const items = plan.items.filter((i) => i.day === day && i.start !== null);
  const free = (plan.avail[day] ?? []).filter((s) => { const w = { start: s, end: s + WINDOW }; return !school.some((b) => overlap(w, b)) && !items.some((i) => overlap(w, spanOf(i))); });
  return (
    <div className={`pv-col${today ? ' today' : ''}`} style={{ height: (to - from) * PPM, backgroundSize: `100% ${60 * PPM}px` }}
      onClick={(e) => { if (e.target !== e.currentTarget) return; const y = e.nativeEvent.offsetY; onFree(Math.min(to - 15, from + Math.floor(y / PPM / 15) * 15)); }}>
      {free.map((s) => <button key={s} className="pv-free" style={{ top: top(s), height: WINDOW * PPM - 2 }} onClick={() => onFree(s)} aria-label={`פנוי ב${DAY_NAMES[day]} ${fmtMin(s)}. שבץ תלמיד`}><span>פנוי</span><small>{fmtMin(s)}</small></button>)}
      {school.map((b, i) => <div key={i} className="pv-school" style={{ top: top(b.start), height: (b.end - b.start) * PPM - 2 }}><span>בית ספר</span><small>{fmtMin(b.start)}–{fmtMin(b.end)}</small></div>)}
      {items.map((i: PlanItem) => (
        <button key={i.id} className={`pv-lesson${i.kind === 'optional' ? ' opt' : ''}${i.dur <= 45 ? ' short' : ''}`} style={{ top: top(i.start!), height: i.dur * PPM - 2 }} onClick={() => onItem(i.id)}
          aria-label={`${i.name}, ${DAY_NAMES[day]} ${fmtMin(i.start!)}–${fmtMin(i.start! + i.dur)}, ${i.kind === 'optional' ? 'אופציונלי' : 'קבוע'}. לעריכה`}>
          <strong>{i.name}</strong><small>{fmtMin(i.start!)}–{fmtMin(i.start! + i.dur)}</small>{i.kind === 'optional' && i.dur >= 90 && <small>אופציונלי</small>}
        </button>
      ))}
    </div>
  );
}
