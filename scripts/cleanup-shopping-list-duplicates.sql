-- Cleanup for the shopping_lists duplication bug (fixed in dao/shoppingList.dao.js
-- syncFromClient, which used to blindly `create()` a new list on every sync call
-- instead of upserting by (user_id, name)). Production data as of this writing:
-- shopping_lists had 81,990 rows, 81,976 of which were duplicates belonging to
-- just 3 users; shopping_list_items only had 18 rows total.
--
-- This script:
--   1. Moves any items sitting on a non-keeper duplicate list onto the
--      "keeper" (oldest row per (user_id, name)), skipping items that would
--      collide with something already on the keeper (same product_id +
--      variant_id).
--   2. Deletes the non-keeper duplicate lists (their remaining items, if any,
--      cascade-delete with them since they've already been migrated above).
--   3. Adds the unique constraint (user_id, name) so this class of bug can't
--      recur — matches the `@@unique([user_id, name])` now in
--      prisma/models/shopping_lists.prisma.
--
-- Each step is a single self-contained statement (CTEs recomputed inline,
-- no CREATE TEMP TABLE) so it works no matter how your SQL runner batches
-- statements — some editors/poolers execute each statement on its own
-- connection, which breaks session-scoped temp tables across statements.
--
-- Run manually (not via `prisma migrate`). Review the SELECT output after
-- step 0 and after the delete before trusting the COMMIT.

BEGIN;

-- Step 0: sanity check — how much are we about to touch?
SELECT
  (SELECT count(*) FROM shopping_lists) AS total_lists_before,
  (SELECT count(*) FROM shopping_list_items) AS total_items_before,
  (SELECT count(*) FROM (
     SELECT user_id, name FROM shopping_lists GROUP BY user_id, name HAVING count(*) > 1
   ) x) AS duplicate_groups;

-- Step 1: migrate items sitting on non-keeper lists onto the keeper,
-- skipping anything that would collide with an item already on the keeper.
WITH keepers AS (
  SELECT DISTINCT ON (user_id, name)
    id AS keeper_id, user_id, name
  FROM shopping_lists
  ORDER BY user_id, name, created_at ASC, id ASC
),
list_to_keeper AS (
  SELECT sl.id AS list_id, k.keeper_id
  FROM shopping_lists sl
  JOIN keepers k ON k.user_id = sl.user_id AND k.name = sl.name
),
movable AS (
  SELECT sli.id AS item_id, ltk.keeper_id
  FROM shopping_list_items sli
  JOIN list_to_keeper ltk ON ltk.list_id = sli.list_id
  WHERE sli.list_id <> ltk.keeper_id
    AND NOT EXISTS (
      SELECT 1 FROM shopping_list_items existing
      WHERE existing.list_id = ltk.keeper_id
        AND existing.product_id = sli.product_id
        AND existing.variant_id IS NOT DISTINCT FROM sli.variant_id
    )
)
UPDATE shopping_list_items
SET list_id = movable.keeper_id
FROM movable
WHERE shopping_list_items.id = movable.item_id;

-- Step 2: delete the non-keeper duplicate lists.
-- Any items still pointing at them (i.e. ones that collided in step 1 and
-- were intentionally left behind as true duplicates) cascade-delete too.
WITH keepers AS (
  SELECT DISTINCT ON (user_id, name)
    id AS keeper_id, user_id, name
  FROM shopping_lists
  ORDER BY user_id, name, created_at ASC, id ASC
)
DELETE FROM shopping_lists sl
USING keepers k
WHERE k.user_id = sl.user_id AND k.name = sl.name AND sl.id <> k.keeper_id;

-- Verify: should now show zero duplicate groups
SELECT
  (SELECT count(*) FROM shopping_lists) AS total_lists_after,
  (SELECT count(*) FROM shopping_list_items) AS total_items_after,
  (SELECT count(*) FROM (
     SELECT user_id, name FROM shopping_lists GROUP BY user_id, name HAVING count(*) > 1
   ) x) AS duplicate_groups_remaining;

-- Step 3: guard against this ever recurring at the data layer.
-- Idempotent: safe to re-run this whole script — skips if already added
-- (e.g. by a previous run of this same script).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'shopping_lists'::regclass
      AND conname = 'shopping_lists_user_id_name_key'
  ) THEN
    ALTER TABLE shopping_lists
      ADD CONSTRAINT shopping_lists_user_id_name_key UNIQUE (user_id, name);
  END IF;
END $$;

-- Review the two SELECT outputs above. If they look right:
COMMIT;
-- If anything looks wrong, run ROLLBACK; instead of COMMIT;
