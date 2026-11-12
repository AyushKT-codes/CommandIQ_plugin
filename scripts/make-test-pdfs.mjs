import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../test/", import.meta.url));
function makePdf(text, linkTarget) {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 72 740 Td (${escaped}) Tj ET`;
  const pageAnnotations = linkTarget ? " /Annots [6 0 R]" : "";
  const escapedLink = linkTarget?.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R${pageAnnotations} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
  ];
  if (linkTarget) objects.push(`<< /Type /Annot /Subtype /Link /Rect [72 730 300 750] /Border [0 0 0] /A << /S /URI /URI (${escapedLink}) >> >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf, "ascii")); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
await writeFile(`${dir}clean.pdf`, makePdf("Quarterly planning notes: review the roadmap on Friday."));
await writeFile(`${dir}fake-credential.pdf`, makePdf("Synthetic test only: password=not-a-real-password-123"));
await writeFile(`${dir}clean-link.pdf`, makePdf("Benign document with a normal web link.", "https://example.com/documentation"));
await writeFile(`${dir}dangerous-link.pdf`, makePdf("Synthetic test document with a script link.", "javascript:alert(1)"));
console.log("Created synthetic clean, credential, safe-link, and risky-link PDFs in test/.");
