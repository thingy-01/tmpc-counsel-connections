-- Additive notification delivery lease used to recover an interrupted send.
-- Apply with 0001 and 0002 in the release's external psql transaction.

ALTER TABLE "notification_recipients"
  ADD COLUMN "send_claimed_at" timestamp with time zone;
