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

## Automatic POS email pickup + morning summary
1. In Vercel → Settings → Environment Variables add:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase secret/service_role key (paste directly; never share)
   - `POS_INBOUND_SECRET` — any long random string (30+ characters)
   Then redeploy.
2. In the Google account that receives posreports@ mail, open script.google.com → New project,
   paste `scripts/google-apps-script/Code.gs`, set the three Script properties, run `processInbox`
   once to approve permissions, then add the three time-driven triggers listed at the top of the file.

## Database updates (run in Supabase SQL Editor, in order)
0001_init · 0002_people · 0003_manager_upload · 0004_resolutions
