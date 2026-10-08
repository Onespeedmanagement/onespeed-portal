import { readFile } from 'node:fs/promises';
import { getDocumentProxy } from 'unpdf';
const buf = new Uint8Array(await readFile(process.argv[2]));
const pdf = await getDocumentProxy(buf);
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  for (const it of tc.items.slice(0, 400)) if (it.str.trim()) console.log(p, Math.round(it.transform[4]), Math.round(it.transform[5]), JSON.stringify(it.str));
}
