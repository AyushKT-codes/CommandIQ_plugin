import { build } from "esbuild";
import { access, cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
await rm(dist, { recursive: true, force: true });
await mkdir(fileURLToPath(new URL("../dist/core/", import.meta.url)), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("../src/core/security-core.ts", import.meta.url))],
  outfile: `${dist}/core/security-core.js`, bundle: true, format: "esm", target: "es2022",
});
const pdfWorker = new URL("../node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url);
try {
  await access(pdfWorker);
} catch {
  throw new Error("PDF.js worker is missing. From the project root, run `npm install` and then retry `npm run build`.");
}
await cp(pdfWorker, `${dist}/pdf.worker.mjs`);
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url), `${dist}/${directory}`, { recursive: true });
}
console.log("CommandIQ demo build written to dist/.");
