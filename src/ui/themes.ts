export type ThemeId = 'sky-blue' | 'olive-paper' | 'executive-navy' | 'espresso' | 'desert-sand' | 'terracotta';

export interface Theme {
  id: ThemeId; name: string;
  bg: string; surface: string; sidebar: string; ink: string; accent: string; border: string;
  /** נגזרות לנגישות (מחושבות/נבדקות ב-scripts/check-contrast.ts) */
  sidebarInk: string; onAccent: string; muted: string; accentText: string;
}

export const THEMES: Theme[] = [
  { id: 'sky-blue', name: 'Sky Blue', bg: '#EAF5FF', surface: '#FFFFFF', sidebar: '#CFE8FC', ink: '#234C6B', accent: '#1684C2', border: '#C7E2F5',
    sidebarInk: '#183A52', onAccent: '#031521', muted: '#4A6B84', accentText: '#0F6A9E' },
  { id: 'olive-paper', name: 'Olive Paper', bg: '#F2F1E4', surface: '#FFFEF6', sidebar: '#626B45', ink: '#424834', accent: '#69794A', border: '#DFE0C9',
    sidebarInk: '#FFFFFF', onAccent: '#FFFFFF', muted: '#5F654F', accentText: '#56653B' },
  { id: 'executive-navy', name: 'Executive Navy', bg: '#F1F5F9', surface: '#FFFFFF', sidebar: '#142D4B', ink: '#20344A', accent: '#245F9E', border: '#D8E2EC',
    sidebarInk: '#FFFFFF', onAccent: '#FFFFFF', muted: '#4D6074', accentText: '#245F9E' },
  { id: 'espresso', name: 'Espresso', bg: '#231C19', surface: '#382C27', sidebar: '#17110F', ink: '#F8EBDD', accent: '#D7A979', border: '#554239',
    sidebarInk: '#F8EBDD', onAccent: '#231C19', muted: '#CDB9A6', accentText: '#D7A979' },
  { id: 'desert-sand', name: 'Desert Sand', bg: '#F2E7D4', surface: '#FFF9ED', sidebar: '#E2C9A5', ink: '#59452F', accent: '#9C6C32', border: '#E0CEB4',
    sidebarInk: '#3F301F', onAccent: '#FFFFFF', muted: '#6E5A43', accentText: '#855A25' },
  { id: 'terracotta', name: 'Terracotta', bg: '#F9F0E8', surface: '#FFF9F2', sidebar: '#B65D43', ink: '#533A30', accent: '#A85139', border: '#E8D4C4',
    sidebarInk: '#FFFFFF', onAccent: '#FFFFFF', muted: '#715A4E', accentText: '#A85139' },
];

export function applyTheme(id: ThemeId) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const s = document.documentElement.style;
  const map: Record<string, string> = {
    '--bg': t.bg, '--surface': t.surface, '--sidebar': t.sidebar, '--ink': t.ink, '--accent': t.accent,
    '--border': t.border, '--sidebar-ink': t.sidebarInk, '--on-accent': t.onAccent, '--muted': t.muted, '--accent-text': t.accentText,
  };
  Object.entries(map).forEach(([k, v]) => s.setProperty(k, v));
  document.documentElement.dataset.theme = t.id;
}
