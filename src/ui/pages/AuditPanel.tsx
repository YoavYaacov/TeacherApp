import { useEffect, useState } from 'react';
import { useStore } from '../../data/store';
import { supabase } from '../../lib/supabase';
import { TABLE_LABEL } from '../../lib/backup';
import { label } from '../../lib/domain';

interface Row { id: number; at: string; table_name: string; row_id: string | null; action: string; changed_columns: string[] | null }
const ACTION: Record<string, string> = { INSERT: 'הוספה', UPDATE: 'עדכון', DELETE: 'מחיקה' };
const PERIOD: Record<string, string> = { h1: 'מחצית א׳', h2: 'מחצית ב׳', annual: 'שנתי' };

/** היסטוריית שינויים בנתונים רגישים (ציונים סופיים, שיוכים, תלמידים, הגדרות הערכה). נשמרים מזהים ושמות עמודות בלבד, לא תוכן. */
export function AuditPanel() {
  const store = useStore();
  const { db } = store;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (store.kind !== 'supabase' || !supabase) return;
    void supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(100).then(({ data, error }) => { if (error) setErr(error.message); else setRows(data as Row[]); });
  }, [store.kind]);
  if (store.kind !== 'supabase') return null;

  const what = (r: Row) => {
    const sName = (id?: string) => { const s = db.students.find((x) => x.id === id); return s ? label(s) : null; };
    if (r.table_name === 'final_grades') { const f = (db.final_grades as unknown as { id: string; student_id: string; group_id: string; period: string; value: number }[]).find((x) => x.id === r.row_id); if (f) return `${sName(f.student_id) ?? '—'} · ${db.study_groups.find((g) => g.id === f.group_id)?.name ?? ''} · ${PERIOD[f.period]} (כעת ${f.value})`; }
    if (r.table_name === 'students') { const n = sName(r.row_id ?? undefined); if (n) return n; }
    if (r.table_name === 'enrollments') { const e = db.enrollments.find((x) => x.id === r.row_id); if (e) return `${sName(e.student_id) ?? '—'} · ${db.study_groups.find((g) => g.id === e.group_id)?.name ?? ''}`; }
    return r.row_id ? `מזהה ${r.row_id.slice(0, 8)}` : '';
  };
  return <div className="bk-sec">
    <h3>היסטוריית שינויים</h3>
    <p className="muted">100 הפעולות האחרונות בציונים סופיים, שיוך תלמידים לקבוצות, תלמידים והגדרות הערכה. נרשמים רק זמן, סוג הפעולה והעמודות שהשתנו, ללא תוכן.</p>
    {err && <p className="issue" role="alert">{err}</p>}
    {rows && (rows.length === 0 ? <p className="muted">אין עדיין פעולות.</p> :
      <div className="card flush" style={{ maxHeight: 360, overflow: 'auto' }}><table className="dt"><thead><tr><th>זמן</th><th>פעולה</th><th>נתונים</th><th>פרט</th><th>עמודות</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{new Date(r.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{ACTION[r.action] ?? r.action}</td><td>{r.table_name === 'final_grades' ? 'ציונים סופיים' : r.table_name === 'assessment_events' ? 'אירועי הערכה' : TABLE_LABEL[r.table_name] ?? (r.table_name === 'grade_categories' ? 'קטגוריות ציון' : r.table_name)}</td><td>{what(r)}</td><td className="muted">{r.changed_columns?.join(', ')}</td></tr>)}</tbody></table></div>)}
  </div>;
}
