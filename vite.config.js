import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * PDF font modules read TTF bytes with node:fs on the server/tests. In the
 * browser bundle we replace each module with inlined base64 so the bytes ship
 * only inside the lazily imported PDF chunk.
 */
const INLINE_PDF_FONT_MODULES = [
  {
    module: "/src/homeroom/vietnamesePdfFont.js",
    exportName: "loadVietnamesePdfFontBytes",
    fonts: { default: "src/assets/fonts/NotoSans-Regular.ttf" },
  },
  {
    module: "/src/duties/sharedDutyScheduleFont.js",
    exportName: "loadSharedSchedulePdfFontBytes",
    fonts: {
      regular: "src/assets/fonts/Tinos-Regular.ttf",
      bold: "src/assets/fonts/Tinos-Bold.ttf",
    },
  },
];

function inlinePdfFonts() {
  return {
    name: "inline-pdf-fonts",
    enforce: "pre",
    /**
     * @param {string} id
     */
    load(id) {
      const filePath = id.split("?")[0].replace(/\\/g, "/");
      const entry = INLINE_PDF_FONT_MODULES.find((item) => filePath.endsWith(item.module));
      if (!entry) return null;
      const keys = Object.keys(entry.fonts);
      const encoded = keys.map(
        (key) => `${JSON.stringify(key)}: decode(${JSON.stringify(readFileSync(resolve(process.cwd(), entry.fonts[key])).toString("base64"))})`,
      );
      const body = keys.length === 1 && keys[0] === "default"
        ? `return decode(${JSON.stringify(readFileSync(resolve(process.cwd(), entry.fonts.default)).toString("base64"))});`
        : `return { ${encoded.join(", ")} };`;
      return `
function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export function ${entry.exportName}() {
  ${body}
}
`;
    },
  };
}

export default defineConfig({
  plugins: [inlinePdfFonts(), react()],
  assetsInclude: ["**/*.ttf"],
  server: {
    allowedHosts: ["lvt.vscgroup.io.vn"],
    proxy: {
      "/api/auth": {
        target: "http://127.0.0.1:3211",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:3210",
        changeOrigin: true,
        ws: true,
      },
      "/.well-known": {
        target: "http://127.0.0.1:3211",
        changeOrigin: true,
      },
    },
  },
});
