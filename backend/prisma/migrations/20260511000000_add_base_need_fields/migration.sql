-- Add Base Need fields (sedimentación a 12 meses)
ALTER TABLE Need
  ADD COLUMN isBase TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN sedimentedAt DATETIME(3) NULL,
  ADD COLUMN baselineUserCount INT NULL,
  ADD COLUMN lastReviewCycle1 DATETIME(3) NULL,
  ADD COLUMN lastReviewCycle2 DATETIME(3) NULL,
  ADD COLUMN userCountCycle1 INT NULL,
  ADD COLUMN userCountCycle2 INT NULL;
