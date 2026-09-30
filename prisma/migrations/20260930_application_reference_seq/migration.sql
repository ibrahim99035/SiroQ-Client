-- Filing references are allocated by the database, never by the client.
--
-- `applications.reference` was NOT NULL with no default, so every insert had to
-- invent a value in application code. Two problems with that: clients could
-- collide on the unique index, and the counter would drift or repeat after a
-- rollback. A sequence makes the database the single allocator.
--
-- The sequence starts at 2617 because the seeded filings already occupy
-- AP-2026-2601 .. AP-2026-2616 contiguously. Starting at 1 would not collide
-- with the unique index (the prefix differs) but would make the demo's numbering
-- appear to run backwards, and a later re-seed would collide outright.
CREATE SEQUENCE IF NOT EXISTS "application_reference_seq" START 2617;

-- AP-2026-####, zero-padded to four digits so the sequence sorts lexically in
-- the same order it allocates.
--
-- The year is a literal rather than derived from now(): the prefix is a product
-- decision about the current filing year, not a property of the clock, and
-- baking `extract(year from now())` in would silently reissue a prefix change
-- without a migration.
ALTER TABLE "applications"
  ALTER COLUMN "reference"
  SET DEFAULT 'AP-2026-' || lpad(nextval('application_reference_seq')::text, 4, '0');
