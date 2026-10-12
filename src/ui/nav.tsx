import { createContext, useContext } from 'react';
export type Page = 'home' | 'groups' | 'calendar' | 'settings';
export interface Nav { page: Page; groupId: string | null; go(page: Page, groupId?: string | null): void }
export const NavCtx = createContext<Nav>({ page: 'home', groupId: null, go: () => undefined });
export const useNav = () => useContext(NavCtx);
