import { readFileSync } from 'node:fs';
import { parseMonthlyReport } from '../src/lib/history/parseMonthlyReport';
const r = await parseMonthlyReport(new Uint8Array(readFileSync(process.argv[2])), Number(process.argv[3] ?? 2026));
for (const x of r) console.log(x.code.padEnd(9), x.month, String(x.revenue).padStart(10), String(x.customers ?? '-').padStart(6), String(x.profitPct ?? '-').padStart(6), String(x.ticket ?? '-').padStart(6), x.warning ?? '');
console.log(r.length, 'months');
