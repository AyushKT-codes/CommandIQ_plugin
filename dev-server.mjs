import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host}`).pathname;
  const relative = pathname === "/" ? "demo.html" : decodeURIComponent(pathname.slice(1));
  const target = resolve(root, relative);
  if (!target.startsWith(root + sep) && target !== root) { res.writeHead(403).end(); return; }
  try { const data = await readFile(target); res.writeHead(200, { "content-type": types[extname(target)] || "application/octet-stream" }).end(data); }
  catch { res.writeHead(404).end("Not found. Run npm run build first for the demo module."); }
}).listen(port, "127.0.0.1", () => console.log(`Local demo: http://127.0.0.1:${port}`));
