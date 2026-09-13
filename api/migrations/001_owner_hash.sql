-- Adds the delete-key column to a database created before builds could be
-- taken down by whoever published them. Only needed on an existing deployment;
-- schema.sql already has it for a fresh one.
--
--   npx wrangler d1 execute dawnwalker-builds --remote --file=migrations/001_owner_hash.sql
--
-- Builds published before this ran have an empty owner_hash and so have no key.
-- That is deliberate: an empty hash matches nothing, so they stay admin-only
-- rather than becoming deletable by anyone who sends an empty key.
ALTER TABLE builds ADD COLUMN owner_hash TEXT NOT NULL DEFAULT '';
