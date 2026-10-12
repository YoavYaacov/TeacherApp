import { createContext, useContext } from 'react';
import type { AiContext } from '../data/types';
export type Page = 'home' | 'groups' | 'calendar' | 'settings' | 'assistant';
export interface Nav {
  page: Page; groupId: string | null; go(page: Page, groupId?: string | null): void;
  /** פתיחת העוזר האישי, אופציונלית עם הקשר (מערכת/קבוצה/תלמיד/שיעור) */
  openAssistant(ctx?: AiContext): void; aiCtx: AiContext | null; clearAiCtx(): void;
}
export const NavCtx = createContext<Nav>({ page: 'home', groupId: null, go: () => undefined, openAssistant: () => undefined, aiCtx: null, clearAiCtx: () => undefined });
export const useNav = () => useContext(NavCtx);
