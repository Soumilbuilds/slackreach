# Deploying SlackReach

## What Is Safe

- The Whop migration only adds new billing columns.
- Existing users, campaigns, accounts, and leads are not deleted by `npx prisma migrate deploy`.
- The real production risk is pointing `DATABASE_URL` at the wrong SQLite file or deploying with missing env vars.

## Before First Deploy

1. Fix the Whop webhook URL if needed.
2. Make sure production env vars are set.
3. Back up the production database file.

If production currently uses SQLite, back it up before migrating:

```bash
cp /path/to/current.sqlite /path/to/current.sqlite.backup-$(date +%F-%H%M%S)
```

If production currently uses `file:./dev.db`, back up that file in the app directory before deployment.

## Required Production Env Vars

```env
DATABASE_URL="file:/absolute/path/to/your/production.sqlite"
SESSION_SECRET="replace-with-a-long-random-secret"
APP_BASE_URL="https://app.slackreach.com"
WHOP_API_KEY="replace-with-company-api-key"
WHOP_COMPANY_ID="biz_..."
WHOP_WEBHOOK_SECRET="ws_..."
WHOP_ENVIRONMENT="production"
```

Important:

- Keep `DATABASE_URL` pointed at the current production DB file if you already have real users.
- Do not point production at a fresh empty SQLite path unless you intend to start with a new database.
- `APP_BASE_URL` must stay `https://app.slackreach.com`.
- The Whop webhook must target `https://app.slackreach.com/api/whop/webhook`.

## Manual Deploy

From the VPS:

```bash
cd /path/to/slackreach
git pull --ff-only origin main
npm install
npx prisma migrate deploy
npm run build
```

Then restart the process manager. Example:

```bash
pm2 restart slackreach --update-env
```

Or, if this app is under systemd:

```bash
sudo systemctl restart slackreach
```

## GitHub Actions Auto Deploy

This repo includes `.github/workflows/deploy.yml`.

Add these GitHub Actions secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_PORT`
- `VPS_SSH_KEY`
- `APP_DIR`
- `RESTART_COMMAND`

Example `RESTART_COMMAND` values:

- `pm2 restart slackreach --update-env`
- `sudo systemctl restart slackreach`

The workflow assumes:

- the VPS already has the repo cloned at `APP_DIR`
- the repo on the VPS can `git pull origin main`
- `npm`, `node`, and Prisma dependencies can build on the server

## Whop Webhook Events

Register these events on the company webhook:

- `setup_intent_succeeded`
- `membership_activated`
- `membership_deactivated`
- `membership_cancel_at_period_end_changed`
- `payment_created`
- `payment_succeeded`
- `payment_failed`
- `payment_pending`
- `invoice_created`
- `invoice_paid`
- `invoice_past_due`
- `invoice_voided`
