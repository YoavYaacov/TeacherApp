export const tables = (globalThis.__tables ??= {});
let seq = 0;
const T = (n) => (tables[n] ??= []);
class Q {
  constructor(t) { this.t = t; this.f = []; this.mode = 'select'; }
  select() { return this; }
  eq(k, v) { this.f.push((r) => r[k] === v); return this; }
  neq(k, v) { this.f.push((r) => r[k] !== v); return this; }
  in(k, v) { this.f.push((r) => v.includes(r[k])); return this; }
  is(k, v) { this.f.push((r) => (r[k] ?? null) === v); return this; }
  lt(k, v) { this.f.push((r) => r[k] < v); return this; }
  limit() { return this; }
  insert(rows) { this.mode = 'insert'; this.rows = [].concat(rows); return this; }
  upsert(rows, o = {}) { this.mode = 'upsert'; this.rows = [].concat(rows); this.keys = (o.onConflict ?? 'id').split(','); return this; }
  update(p) { this.mode = 'update'; this.patch = p; return this; }
  delete() { this.mode = 'delete'; return this; }
  maybeSingle() { this.single = true; return this; }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
  run() {
    const arr = T(this.t); const match = (r) => this.f.every((f) => f(r));
    if (this.mode === 'select') { const d = arr.filter(match).map((r) => ({ ...r })); return { data: this.single ? d[0] ?? null : d, error: null }; }
    if (this.mode === 'insert') { this.rows.forEach((r) => arr.push({ id: `id${++seq}`, local_dirty: false, ...r })); return { data: null, error: null }; }
    if (this.mode === 'upsert') {
      for (const r of this.rows) { const i = arr.findIndex((x) => this.keys.every((k) => x[k] === r[k] && r[k] !== undefined)); if (i >= 0) arr[i] = { ...arr[i], ...r }; else arr.push({ id: `id${++seq}`, local_dirty: false, ...r }); }
      return { data: null, error: null };
    }
    if (this.mode === 'update') { arr.forEach((r, i) => match(r) && (arr[i] = { ...r, ...this.patch })); return { data: null, error: null }; }
    if (this.mode === 'delete') { tables[this.t] = arr.filter((r) => !match(r)); return { data: null, error: null }; }
  }
}
export const createClient = () => ({ from: (t) => new Q(t), rpc: async () => ({ data: true, error: null }) });
