# ARRIVE AI Assistant — implementation notes

## Scope
This branch adds an opt-in AI assistant to the existing static HTML dashboard. It does not change the existing KPI formulas or data-loading path. The browser sends aggregate metrics, active-filter labels, and monthly counts to the serverless endpoint; raw complaint rows, customer names, complaint content, notes, policy/shipment identifiers, and phone/email/address fields are excluded.

## Vercel environment variables
Configure these in Vercel Project Settings → Environment Variables before enabling the assistant:
- `AI_API_KEY`: secret API key for the selected model provider. Never expose it in browser code or commit it to Git.
- `AI_ACCESS_CODE`: a strong shared access code for authorized dashboard users. The browser keeps it in sessionStorage for the current tab/session only. Rotate it if shared outside the approved team.
- `AI_ALLOWED_ORIGINS`: comma-separated exact origin(s), e.g. `https://arrive-complaints-dashboard.vercel.app`. Add actual production and approved preview origins only.
- `AI_MODEL` (optional): defaults to `gpt-4.1-mini` as a cost-conscious starting point. Confirm model availability and pricing in the provider account before production use.

Do not add any of these values to `.env` files committed to GitHub. Do not use wildcard origins.

## Deploy prerequisites
The repository is currently a static HTML project without a package manifest. Vercel supports Node.js functions in `/api` for this layout; confirm the Vercel project root is the repository root and the function is detected in a preview deployment. No changes to the current dashboard data API are required for the first version.

## Security notes
- The endpoint requires an exact allowed Origin and the shared access code.
- It enforces POST, question and payload size limits, a best-effort per-instance IP rate limit, no-store responses, and a 25-second provider timeout.
- The browser sends aggregated metrics only. Never add raw rows or complaint free text to the request.
- The shared access code is a lightweight cost gate, not individual identity or role-based access control. If the dashboard becomes externally accessible, add real authentication/authorization before broader rollout.
- The in-memory rate limit is best-effort in serverless environments; configure provider budget alerts and usage limits as an additional cost guard.
- AI produces analysis and draft actions only. It cannot approve compensation or modify/close complaints.

## Local tests
Run:
```sh
node --test tests/ai-security.test.cjs
```

## Rollout
1. Deploy this branch as a Vercel Preview, not Production.
2. Set the environment variables in Preview scope.
3. Confirm the dashboard still loads with AI unavailable and existing filters, exports, charts, refresh, and report flows remain unchanged.
4. Compare AI aggregate counts against the dashboard and source sheet for at least two months.
5. Review provider usage and response quality before promoting to Production.
