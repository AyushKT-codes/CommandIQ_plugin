import { build } from "esbuild";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../dist/extension/", import.meta.url));
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL("../extension/manifest.json", import.meta.url), `${out}/manifest.json`);
const pdfWorker = new URL("../node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url);
try {
  await access(pdfWorker);
} catch {
  throw new Error("PDF.js worker is missing. From the project root, run `npm install` and then retry `npm run build:extension`.");
}
await cp(pdfWorker, `${out}/pdf.worker.mjs`);
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url), `${out}/${directory}`, { recursive: true });
}
await build({ entryPoints: [fileURLToPath(new URL("../src/extension/content-entry.ts", import.meta.url))], outfile: `${out}/content.js`, bundle: true, format: "iife", target: "chrome110" });
await build({ entryPoints: [fileURLToPath(new URL("../src/extension/main-world-entry.ts", import.meta.url))], outfile: `${out}/main-world.js`, bundle: true, format: "iife", target: "chrome110" });
for (const file of ["content.js", "main-world.js"]) {
  const output = `${out}/${file}`;
  const source = await readFile(output, "utf8");
  await writeFile(output, source.replaceAll("Upload Security Guard", "CommandIQ"));
}
console.log("Extension built in dist/extension. Load that folder as an unpacked extension in Chromium.");
