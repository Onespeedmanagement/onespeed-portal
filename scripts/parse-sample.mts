// Usage: npx tsx scripts/parse-sample.mts path/to/report.pdf
import { readFile } from 'node:fs/promises';
import { parseCashSalesSummary } from '../src/lib/pos/parseCashSalesSummary.ts';

const file = process.argv[2];
if (!file) throw new Error('Pass the path to a POS PDF');
const result = await parseCashSalesSummary(new Uint8Array(await readFile(file)));
console.log(JSON.stringify(result, null, 2));
const failed = result.checks.filter(c => !c.ok);
console.log(failed.length ? `\n${failed.length} check(s) FAILED` : '\nAll checks passed');
process.exit(failed.length ? 1 : 0);
