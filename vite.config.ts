import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
// פלט יחיד (dist/index.html) — אפשר לפתוח ישירות מהדיסק או להעלות לכל אירוח סטטי.
export default defineConfig({ plugins: [react(), viteSingleFile()], base: './', test: { environment: 'node' } });
