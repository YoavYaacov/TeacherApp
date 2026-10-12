import { describe, expect, it } from 'vitest';
import { buildEnvelope, parseBackupFile } from './backup';

const data = { students: [{ id: 'a', first_name: 'דנה', last_name: 'כהן', home_class: null, archived_at: null }], grades: [{ event_id: 'e', student_id: 'a', attempt: 1, status: 'score', score: 85.5 }] } as never;

describe('backup file', () => {
  it('roundtrip with checksum', async () => {
    const env = await buildEnvelope(data, 'supabase');
    const p = await parseBackupFile(JSON.stringify(env, null, 1));
    expect(p.verified).toBe(true);
    expect(p.counts.students).toBe(1);
    expect(p.counts.grades).toBe(1);
  });
  it('detects tampering', async () => {
    const env = await buildEnvelope(data, 'local');
    const bad = JSON.stringify(env).replace('85.5', '95.5');
    await expect(parseBackupFile(bad)).rejects.toThrow('סכום הביקורת');
  });
  it('detects truncated file', async () => {
    const env = JSON.stringify(await buildEnvelope(data, 'local'));
    await expect(parseBackupFile(env.slice(0, env.length - 20))).rejects.toThrow('JSON');
  });
  it('detects count mismatch', async () => {
    const env = await buildEnvelope(data, 'local');
    env.counts.students = 5;
    await expect(parseBackupFile(JSON.stringify(env))).rejects.toThrow('students');
  });
  it('accepts old v1 file without checksum', async () => {
    const p = await parseBackupFile(JSON.stringify({ version: 1, exportedAt: 'x', data }));
    expect(p.verified).toBeNull();
  });
  it('rejects foreign / malformed', async () => {
    await expect(parseBackupFile('{"a":1}')).rejects.toThrow();
    await expect(parseBackupFile(JSON.stringify({ data: { students: 'x' } }))).rejects.toThrow('students');
    await expect(parseBackupFile(JSON.stringify({ data: { evil: [] } }))).rejects.toThrow('לא מוכרת');
    await expect(parseBackupFile(JSON.stringify({ format: 'other', data }))).rejects.toThrow();
    await expect(parseBackupFile(JSON.stringify({ data: {} }))).rejects.toThrow('ריק');
  });
});
