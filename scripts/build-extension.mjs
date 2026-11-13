import { build } from "esbuild";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../dist/extension/", import.meta.url));
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const hostIds = [...new Set((process.env.COMMANDIQ_HOST_EXTENSION_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean))];
if (hostIds.some(id => !/^[a-p]{32}$/.test(id))) {
  throw new Error("COMMANDIQ_HOST_EXTENSION_IDS must be a comma-separated list of 32-character Chromium extension IDs (letters a–p).");
}
manifest.externally_connectable = { ids: hostIds };
await writeFile(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await cp(new URL("../extension/offscreen.html", import.meta.url), `${out}/offscreen.html`);
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
await build({ entryPoints: [fileURLToPath(new URL("../src/extension/connector-service-worker.ts", import.meta.url))], outfile: `${out}/connector-service-worker.js`, bundle: true, format: "iife", target: "chrome116" });
await build({ entryPoints: [fileURLToPath(new URL("../src/extension/connector-offscreen.ts", import.meta.url))], outfile: `${out}/connector-offscreen.js`, bundle: true, format: "iife", target: "chrome116" });
for (const file of ["content.js", "main-world.js", "connector-service-worker.js", "connector-offscreen.js"]) {
  const output = `${out}/${file}`;
  const source = await readFile(output, "utf8");
  await writeFile(output, source.replaceAll("Upload Security Guard", "CommandIQ"));
}
console.log("Extension built in dist/extension. Load that folder as an unpacked extension in Chromium.");
