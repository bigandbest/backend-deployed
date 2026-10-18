#!/usr/bin/env bash
#
# Baseline the Prisma migration history against the EXISTING database.
#
# Why this is needed
# ------------------
# This database has always been managed with `prisma db push`. 62 of the 139
# models (affiliate_*, referral_*, rider_*, sub_orders, sellers, ...) exist in
# the database but were never created by any file in prisma/migrations/.
# The history is therefore not a valid starting point: `prisma migrate dev`
# rebuilds it on a shadow database, reaches
# 20260406013000_make_affiliate_emails_optional, finds no affiliate_applications
# table, and fails with P3006.
#
# What this script does
# ---------------------
#   1. Reads the CURRENT schema of the live database and writes it as a new
#      baseline migration, prisma/migrations/0_init/migration.sql.
#   2. Marks 0_init and every pre-existing migration as already applied.
#
# Everything those 21 migrations did is, by definition, already captured in
# 0_init (it was diffed from the live database), so marking them applied is
# correct — not a shortcut.
#
# Safety
# ------
#   * Read-only against your data. It runs `migrate diff` (a read) and
#     `migrate resolve` (writes only bookkeeping rows to _prisma_migrations).
#   * No CREATE / ALTER / DROP / DELETE is executed against your schema or data.
#   * It never calls `migrate dev`, `migrate reset` or `db push`.
#   * Re-running it is a no-op: it refuses to overwrite an existing 0_init.
#
# Rollback
# --------
#   rm -rf prisma/migrations/0_init
#   DELETE FROM _prisma_migrations WHERE migration_name = '0_init';
#   -- plus any other rows this script inserted, listed in its output.
#
# After this script
# -----------------
#   npm run db:status   # should report the history is up to date
#   npm run db:deploy   # the ONLY migrate command to run on a server
#
# Never run `npm run db:migrate` (prisma migrate dev) against production: it
# needs a shadow database and can offer to reset the live one.

set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE="prisma/migrations/0_init"

if [ -d "$BASELINE" ]; then
  echo "ERROR: $BASELINE already exists — this database is already baselined."
  echo "       Nothing to do. Use 'npm run db:deploy' to apply new migrations."
  exit 1
fi

echo "==> Compiling schema from prisma/models/"
npm run --silent db:compile

echo "==> Checking current migration state (read-only)"
npx prisma migrate status || true

echo
read -r -p "Baseline the migration history against this database? [y/N] " reply
[ "$reply" = "y" ] || { echo "Aborted. Nothing was changed."; exit 1; }

echo "==> Capturing the live database schema into $BASELINE/migration.sql"
mkdir -p "$BASELINE"
# --from-empty --to-url  => "the SQL that would produce the database as it is now".
# This reads the live schema; it does not execute anything against it.
npx prisma migrate diff \
  --from-empty \
  --to-url "$(node -e 'require("dotenv").config();process.stdout.write(process.env.DIRECT_URL||process.env.DATABASE_URL)')" \
  --script > "$BASELINE/migration.sql"

if [ ! -s "$BASELINE/migration.sql" ]; then
  rm -rf "$BASELINE"
  echo "ERROR: the captured baseline was empty — the database was not read."
  echo "       Check DIRECT_URL in .env. Nothing was changed."
  exit 1
fi
echo "    captured $(wc -l < "$BASELINE/migration.sql") lines"

echo "==> Marking the baseline and all pre-existing migrations as applied"
echo "    (bookkeeping only — none of this SQL is executed)"
for name in $(ls prisma/migrations | grep -vE '\.(sql|toml)$' | sort); do
  echo "    resolve --applied $name"
  npx prisma migrate resolve --applied "$name"
done

echo
echo "==> Done. Verifying:"
npx prisma migrate status

cat <<'EOF'

Next steps
  npm run db:deploy    apply future migrations (safe on a server)
  npm run db:status    check history without changing anything

If `migrate status` or a later `migrate deploy` reports remaining drift between
prisma/schema.prisma and the database, capture it for REVIEW before applying —
do not let a tool resolve it unattended:

  npx prisma migrate diff \
    --from-url "$DIRECT_URL" \
    --to-schema-datamodel prisma/schema.prisma \
    --script > /tmp/drift.sql

Read /tmp/drift.sql. Any DROP in it is data loss; turn the parts you want into a
hand-written migration under prisma/migrations/ instead of running it directly.
EOF
