# Game Machine Manager

## Estimates, monthly snapshots and the settlement ledger

Three features sit on top of the ksys22 revenue fetch:

- **Estimates** (`/estimates`): every time a location's ksys22 period is cleared, the
  final figures for the period that just ended are saved in `cleared_periods`. The
  estimate is period net, less fees, times the location's % share. When a settlement
  sheet is saved in the ledger, the cleared periods for its states are totalled and
  compared with the collections on the sheet; locations that have not cleared since
  the last sheet are listed separately.
- **Monthly Changes** (`/monthly-changes`): a snapshot of locations, machines and
  dispensers is saved after each month ends, and two consecutive snapshots give the
  month's changes, field by field.
- **Settlement Ledger** (`/ledger`, admins only): the monthly partner sheets, read from
  an uploaded image, with partner payouts, funded-item balances and arithmetic checks.

### One-time setup

1. **Database**: run `supabase/migrations/009_estimates_snapshots_ledger.sql` in the
   Supabase SQL editor. It only adds tables, a storage bucket and Florida as a state.
   Run it before deploying this code: the revenue fetch records clears in the new
   table.
2. **Environment variables** (Vercel project settings):
   - `CRON_SECRET`: any long random string. Vercel Cron sends it to
     `/api/cron/daily`, which refuses to run without it.
   - `ANTHROPIC_API_KEY`: used by `/api/ledger/read-image` to read sheet images.
   - Already in use: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, `REVENUE_API_USERNAME`, `REVENUE_API_PASSWORD`.
3. **Ledger data**: open `/ledger`, go to Add image, and use "Import a ledger backup"
   with the backup `.json` file to load existing statements and their images.

### The daily job

`vercel.json` schedules `/api/cron/daily` at 06:15 UTC (just after midnight US
Eastern). Each run:

1. saves the month-end snapshot if the month that just ended has none (the very
   first snapshot is the baseline later months are compared against);
2. refreshes every active location from ksys22, oldest first, and records a cleared
   period for any location whose period start has moved.

Admins can run the same job from the Estimates page ("Check for clears now").
"Fetch All Revenue" and the per-location fetch use the same code path, so a clear is
recorded whichever way the refresh happens.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
