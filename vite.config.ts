import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// מזהה גרסה לכל build: האפליקציה בודקת אותו מול version.json ומציעה רענון כשיוצאת גרסה חדשה.
const BUILD_ID = Date.now().toString(36);
const versionFile = (): Plugin => ({ name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD_ID }) }); } });

// פלט יחיד (dist/index.html) + קבצי PWA מתיקיית public (manifest, sw.js, icons).
export default defineConfig({ plugins: [react(), viteSingleFile(), versionFile()], base: './', define: { __BUILD_ID__: JSON.stringify(BUILD_ID) }, test: { environment: 'node' } });
