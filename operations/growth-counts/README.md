# Three-site aggregate counts
Worker: three-sites-growth.place-oracle-info.workers.dev
D1: three-sites-growth-counts / 787552b9-81f5-4aa5-baa0-88644d4b476d
Account: 3744f500abcef6c7aba77320d512fa0a
Binding: COUNTS. Compatibility date 2026-10-29 (UTC server date at deployment). No secrets in client.

Only day (JST), site, event, source category, test flag and count are stored. No payload details, raw URL/referrer, cookie, IP, user ID, birth, place or dog conditions are stored in this database. Cloudflare transport security logs are outside this table. Counts are event totals, not unique users, paid conversions, or same-session funnels. Ad blockers, DNT/GPC and consent can cause undercounting. Each daily bucket is capped at 10000; a capped value must be reported as a lower bound. Origin checks reduce browser cross-site writes but are not proof of human traffic.

Read through authenticated Cloudflare D1 API only, not a public report endpoint:
SELECT day,site,event,source,SUM(n) AS count FROM daily_counts WHERE is_test=0 GROUP BY day,site,event,source ORDER BY day,site,event;
Test browser visits use ?growth_test=1 and are excluded via is_test=0.

Run: node operations/growth-counts/test.mjs

Rollback: revert client PR merge; leave counts for history. Disable Worker endpoint only after clients are reverted. No paid plan upgrade was performed.
