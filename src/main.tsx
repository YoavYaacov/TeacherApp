import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/hebrew-500.css';
import '@fontsource/rubik/hebrew-700.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import './ui/styles.css';
import { Root } from './ui/Root';
// PWA: רישום ה-service worker (HTTPS בלבד). הוא לא שומר מטמון; ראה public/sw.js.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then((reg) => { document.addEventListener('visibilitychange', () => { if (!document.hidden) void reg.update(); }); }).catch(() => undefined); });
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
