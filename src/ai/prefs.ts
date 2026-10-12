import type { DB } from '../data/types';
export interface AiPrefs {
  /** א׳: למודל נשלחים רק נתונים מצטברים. ב׳: גם נתוני תלמידים בכינויים (ללא שם/הערות פרטיות). */
  level: 'A' | 'B';
  evalStyle: 'encouraging' | 'factual' | 'professional' | 'personal';
  evalLength: 'short' | 'medium' | 'detailed';
  evalVoice: 'third' | 'direct';
  answerLength: 'short' | 'normal' | 'detailed';
  planDetail: 'brief' | 'full';
  practiceMode: 'graded' | 'challenging';
  notes: string;
}
export const DEFAULT_PREFS: AiPrefs = { level: 'B', evalStyle: 'professional', evalLength: 'medium', evalVoice: 'third', answerLength: 'normal', planDetail: 'full', practiceMode: 'graded', notes: '' };
export const getPrefs = (db: DB): AiPrefs => ({ ...DEFAULT_PREFS, ...((db.user_settings[0]?.prefs?.ai as Partial<AiPrefs> | undefined) ?? {}) });
export const getDismissed = (db: DB): Record<string, string> => (db.user_settings[0]?.prefs?.aiDismissed as Record<string, string> | undefined) ?? {};
