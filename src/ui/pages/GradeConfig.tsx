import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { Modal } from '../Modal';
import { termConfig } from '../../lib/gradebook';
import { validateTermConfig } from '../../engine/grades';
import type { StudyGroup } from '../../data/types';

/** שדה לא מבוקר שנשמר ב-blur; key לפי ערך כדי להתרענן ממקור האמת */
function F({ value, onCommit, type = 'text', label, width }: { value: string | number | null; onCommit: (v: string) => void; type?: 'text' | 'num' | 'date'; label: string; width?: number }) {
  const v = value === null ? '' : String(value);
  return <input key={v} className="input" aria-label={label} style={{ width }} defaultValue={v} type={type === 'date' ? 'date' : 'text'} inputMode={type === 'num' ? 'decimal' : undefined}
    onBlur={(e) => { if (e.target.value !== v) onCommit(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
const num = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };

export function ConfigModal({ group, term, onClose }: { group: StudyGroup; term: 1 | 2; onClose: () => void }) {
  const store = useStore();
  const { db } = store;
  const [newCat, setNewCat] = useState('');
  const cats = db.grade_categories.filter((c) => c.group_id === group.id && c.term === term).sort((a, b) => a.sort_order - b.sort_order);
  const issues = validateTermConfig(termConfig(db, group.id, term));
  const evs = (cid: string) => db.assessment_events.filter((e) => e.category_id === cid).sort((a, b) => a.sort_order - b.sort_order);

  const addCat = async (name: string, weight = 0) => {
    const next = Math.max(0, ...cats.map((c) => c.sort_order)) + 1;
    await store.save('grade_categories', [{ group_id: group.id, term, name, weight, event_weight_mode: 'custom', drop_lowest: false, sort_order: next }]);
  };
  const addEvent = async (cid: string) => {
    const list = evs(cid);
    await store.save('assessment_events', [{ group_id: group.id, term, category_id: cid, title: `אירוע ${list.length + 1}`, event_date: null, weight: null, makeup_policy: 'best', cancelled_at: null, sort_order: Math.max(0, ...list.map((e) => e.sort_order)) + 1 }]);
  };
  const equalizeCats = () => {
    const n = cats.length; if (!n) return;
    const base = Math.floor((100 / n) * 100) / 100; const rem = Math.round((100 - base * n) * 100) / 100;
    cats.forEach((c, i) => store.patchFast('grade_categories', c.id, { weight: i === 0 ? Math.round((base + rem) * 100) / 100 : base }));
  };
  const equalizeEvents = (cid: string) => {
    const list = evs(cid).filter((e) => !e.cancelled_at); const n = list.length; if (!n) return;
    const base = Math.floor((100 / n) * 100) / 100; const rem = Math.round((100 - base * n) * 100) / 100;
    list.forEach((e, i) => store.patchFast('assessment_events', e.id, { weight: i === 0 ? Math.round((base + rem) * 100) / 100 : base }));
  };
  const total = cats.reduce((s, c) => s + Number(c.weight), 0);

  return (
    <Modal title={`הגדרות הערכה · מחצית ${term === 1 ? 'א׳' : 'ב׳'}`} onClose={onClose} wide>
      <p className="muted">משקלי הקטגוריות חייבים להסתכם ב-100%, וכך גם משקלי האירועים בכל קטגוריה (או משקלים שווים). המערכת לא מנרמלת הגדרות בשקט.</p>
      {issues.map((i, k) => <p key={k} className="issue" role="alert">{i.message}</p>)}
      {cats.length === 0 && <button className="btn" onClick={async () => { await addCat('מבחנים', 70); await addCat('בוחנים ועבודות', 30); }}>תבנית התחלתית (מבחנים 70%, בוחנים ועבודות 30%) — ניתן לשינוי</button>}
      {cats.map((c) => (
        <section key={c.id} className="card" style={{ marginTop: 12 }}>
          <div className="row">
            <F label="שם קטגוריה" value={c.name} onCommit={(v) => v.trim() && store.patchFast('grade_categories', c.id, { name: v.trim() })} />
            <label className="row">משקל %<F label="משקל קטגוריה" type="num" width={70} value={c.weight} onCommit={(v) => { const n = num(v); if (n !== null && n >= 0 && n <= 100) store.patchFast('grade_categories', c.id, { weight: n }); }} /></label>
            <select className="input" aria-label="משקלי אירועים" value={c.event_weight_mode} onChange={(e) => store.patchFast('grade_categories', c.id, { event_weight_mode: e.target.value as 'equal' | 'custom' })}>
              <option value="custom">משקלי אירועים מותאמים</option><option value="equal">משקלים שווים</option></select>
            <label className="row"><input type="checkbox" checked={c.drop_lowest} onChange={(e) => store.patchFast('grade_categories', c.id, { drop_lowest: e.target.checked })} />וותר על הנמוך ביותר</label>
            {evs(c.id).length === 0 && <button className="btn sm" onClick={() => void store.del('grade_categories', { id: c.id })}>מחק קטגוריה</button>}
          </div>
          <table className="gb" style={{ marginTop: 8, width: '100%' }}><tbody>
            {evs(c.id).map((e) => (
              <tr key={e.id} className={e.cancelled_at ? 'cancelled' : ''}>
                <td><F label="שם אירוע" value={e.title} onCommit={(v) => v.trim() && store.patchFast('assessment_events', e.id, { title: v.trim() })} /></td>
                <td><F label="תאריך" type="date" value={e.event_date} onCommit={(v) => store.patchFast('assessment_events', e.id, { event_date: v || null })} /></td>
                <td>{c.event_weight_mode === 'custom' ? <label className="row">משקל %<F label="משקל אירוע" type="num" width={70} value={e.weight} onCommit={(v) => store.patchFast('assessment_events', e.id, { weight: v.trim() === '' ? null : num(v) })} /></label> : <span className="muted">שווה</span>}</td>
                <td>{e.cancelled_at
                  ? <button className="btn sm" onClick={() => store.patchFast('assessment_events', e.id, { cancelled_at: null })}>שחזר אירוע</button>
                  : <button className="btn sm" onClick={() => { if (confirm('לבטל את האירוע? הציונים נשמרים בהיסטוריה ויוצאו מהחישוב.')) store.patchFast('assessment_events', e.id, { cancelled_at: new Date().toISOString() }); }}>בטל אירוע</button>}</td>
              </tr>))}
          </tbody></table>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => addEvent(c.id)}><Plus size={14} aria-hidden />אירוע הערכה</button>
            {c.event_weight_mode === 'custom' && evs(c.id).length > 1 && <button className="btn sm" onClick={() => equalizeEvents(c.id)}>חלק משקלים שווה בשווה</button>}
          </div>
        </section>))}
      <div className="row" style={{ marginTop: 12 }}>
        <F label="שם קטגוריה חדשה" value={newCat} onCommit={setNewCat} />
        <button className="btn" disabled={!newCat.trim()} onClick={async () => { await addCat(newCat.trim()); setNewCat(''); }}><Plus size={14} aria-hidden />קטגוריה</button>
        {cats.length > 1 && <button className="btn" onClick={equalizeCats}>חלק משקלי קטגוריות שווה בשווה</button>}
        <span className="muted">סה״כ משקלי קטגוריות: {Math.round(total * 100) / 100}%</span>
      </div>
    </Modal>
  );
}
