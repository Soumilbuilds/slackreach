# SlackReach

SlackReach is a Next.js app for Slack outbound automation with in-app billing handled through Whop embedded checkout.

## Billing Status

- Stripe runtime logic has been removed from the app flow.
- Whop is now the billing source of truth.
- The Whop migration is additive at the database level. Existing users are not deleted by the migration.

## Environment Variables

Copy `.env.example` to `.env` for local development. Production must set all required values explicitly.

```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET="replace-with-a-long-random-secret"
APP_BASE_URL="https://app.slackreach.com"
WHOP_API_KEY="replace-with-company-api-key"
WHOP_COMPANY_ID="biz_..."
WHOP_WEBHOOK_SECRET="ws_..."
WHOP_ENVIRONMENT="production"
```

Notes:

- `SESSION_SECRET` must be set in production.
- `DATABASE_URL` must be set in production.
- `APP_BASE_URL` must be the real app origin in production.
- The Whop webhook URL must be `https://app.slackreach.com/api/whop/webhook`.

## Local Setup

```bash
cd /Users/poonam/Desktop/SlackReach
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

App runs at `http://localhost:3000`.

## Production Deploy

Use the steps in [DEPLOY.md](/Users/poonam/Desktop/SlackReach/DEPLOY.md).

Short version:

```bash
git pull --ff-only origin main
npm install
npx prisma migrate deploy
npm run build
# restart your process manager
```

## Whop Plans

- Product: `prod_dykz42RsTpcMC`
- Starter: `plan_TIrQGsxQD2IWT` with 7-day trial
- Growth: `plan_KYchMiFoVLzEb`
- Unlimited: `plan_0mbCPVFKhrg89`

## Public Signup Endpoint

`POST /api/auth/users` is intentionally public for external signup automation.

Example:

```bash
curl -X POST https://app.slackreach.com/api/auth/users \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"strong-password"}'
```
