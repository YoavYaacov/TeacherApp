// תזמור תור אחד: קודם ניתוב מקומי (בלי AI); אחרת Gemini עם כלים. כל נתון עובדתי מגיע מכלי בקוד.
import type { AiConversation, AiMessage, DB } from '../data/types';
import { makeAliasMap } from './pseudo';
import { declarations, toolByName, type Block, type ToolCtx } from './tools';
import { matchIntent } from './local';
import { systemPrompt } from './prompts';
import type { AiPrefs } from './prefs';
import type { GenFn, GenFail } from './gemini';

export interface TurnOk { ok: true; text: string; blocks: Block[]; sources: string[]; usedAI: boolean; redacted: number; usage?: { used: number; limit: number } }
export type TurnResult = TurnOk | GenFail;

export function blocksToText(blocks: unknown[], max = 1500): string {
  const out: string[] = [];
  for (const b of blocks as Block[]) {
    if (b.type === 'table') out.push([b.title, b.columns.join(' | '), ...b.rows.slice(0, 25).map((r) => r.join(' | '))].filter(Boolean).join('\n'));
    else if (b.type === 'list') out.push([b.title, ...b.items].filter(Boolean).join('\n'));
  }
  return out.join('\n\n').slice(0, max);
}

export async function runTurn(p: { db: DB; conv: AiConversation; history: AiMessage[]; text: string; prefs: AiPrefs; gen: GenFn; now?: Date }): Promise<TurnResult> {
  const now = p.now ?? new Date();
  const alias = makeAliasMap(p.db.students, p.conv.id);
  const ctx = p.conv.context;
  const base: ToolCtx = { db: p.db, alias, now, level: p.prefs.level, groupId: ctx.kind === 'system' ? null : ctx.group_id, studentId: ctx.kind === 'student' ? ctx.student_id : null };

  // 1) שאלה עובדתית מוכרת: בקוד בלבד
  const intent = matchIntent(p.db, p.text, now);
  if (intent) {
    const tool = toolByName(intent.tool);
    if (tool) { const r = tool.run(base, intent.args); return { ok: true, text: r.summary + '.', blocks: r.blocks, sources: r.sources, usedAI: false, redacted: 0 }; }
  }

  // 2) AI עם כלים
  const hist = p.history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: alias.pseudonymize([m.content, blocksToText(m.blocks, 1200)].filter(Boolean).join('\n\n')) }] }));
  const contents: unknown[] = [...hist, { role: 'user', parts: [{ text: alias.pseudonymize(p.text) }] }];
  const system = systemPrompt(p.db, ctx, alias, p.prefs, now);
  const blocks: Block[] = [], sources = new Set<string>(); let redacted = 0; let usage: { used: number; limit: number } | undefined;
  for (let round = 0; round < 4; round++) {
    const r = await p.gen({ system, contents, tools: declarations(p.prefs.level), temperature: 0.3, maxOutputTokens: p.prefs.answerLength === 'detailed' ? 3072 : 2048 });
    if (!r.ok) return r;
    redacted += r.redacted; usage = { used: r.used, limit: r.limit };
    if (!r.functionCalls.length) {
      if (!r.text.trim()) return { ok: false, error: 'empty', message: 'לא התקבלה תשובה מהעוזר. נסה לנסח מחדש.' };
      return { ok: true, text: alias.restore(r.text.trim()), blocks, sources: [...sources], usedAI: true, redacted, usage };
    }
    contents.push(r.modelContent);
    const responses = r.functionCalls.map((fc) => {
      const tool = toolByName(fc.name);
      if (!tool || (p.prefs.level === 'A' && tool.studentLevel)) return { functionResponse: { name: fc.name, response: { error: 'הכלי אינו זמין' } } };
      const res = tool.run(base, fc.args);
      for (const b of res.blocks) if (!blocks.some((x) => JSON.stringify(x) === JSON.stringify(b))) blocks.push(b);
      res.sources.forEach((s) => sources.add(s));
      return { functionResponse: { name: fc.name, response: { result: res.model } } };
    });
    contents.push({ role: 'user', parts: responses });
  }
  return { ok: false, error: 'too_many_steps', message: 'השאלה דרשה יותר מדי שלבים. נסה לפצל אותה לשאלות קטנות יותר.' };
}
