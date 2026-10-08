# One Speed Management Portal

Private portal for One Speed Management: sales dashboards, daily cash close-outs,
bookkeeping, the Owners Report and investor views across Wine & Spirits, Goddard Schools and Hotels.

## Stack
- **Next.js** (hosted on Vercel)
- **Supabase**: Postgres database, Google sign-in, file storage. All access rules are enforced
  in the database with row level security (`supabase/migrations`).
- **Claude API**: writes the plain-English summaries in reports.

## Roles
| Role | Sees |
|---|---|
| Admin (ujash@, vrajesh@) | Everything |
| Bookkeeper (accounting@) | Daily entries, deposits; enters the Owners Report |
| Store manager (Gmail, per store) | Today's close-out for their store only |
| Investor (Gmail) | Only the businesses an admin selects, view only |

## POS reports
Nightly "Cash and Sales Summary" PDFs (with the Department wise Sales Summary) arrive at
posreports@onespeedmanagement.com and are read by `src/lib/pos/parseCashSalesSummary.ts`.
Every file is checked (tenders, card types, card + cash = sales, departments = total) before it is saved.

Try it on a sample: `npx tsx scripts/parse-sample.mts path/to/report.pdf`
