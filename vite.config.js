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
      /** @param {string} path */
      const base64 = (path) => JSON.stringify(readFileSync(resolve(process.cwd(), path)).toString("base64"));
      const fonts = /** @type {Record<string, string>} */ (entry.fonts);
      const body = "default" in fonts
        ? `return decode(${base64(fonts.default)});`
        : `return { ${Object.entries(fonts).map(([key, path]) => `${JSON.stringify(key)}: decode(${base64(path)})`).join(", ")} };`;
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
