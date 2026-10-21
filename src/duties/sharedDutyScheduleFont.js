import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node path (server PDF endpoint + tests). In the browser bundle Vite replaces
// this module with inlined bytes (plugin `inline-pdf-fonts` in vite.config.js).
const REGULAR_URL = new URL('../assets/fonts/Tinos-Regular.ttf', import.meta.url);
const BOLD_URL = new URL('../assets/fonts/Tinos-Bold.ttf', import.meta.url);

export function loadSharedSchedulePdfFontBytes() {
  return {
    regular: new Uint8Array(readFileSync(fileURLToPath(REGULAR_URL))),
    bold: new Uint8Array(readFileSync(fileURLToPath(BOLD_URL))),
  };
}
