-- Add evaluatorVotes (pre-existing Prisma schema column, missing in MySQL)
ALTER TABLE ExternalCandidate
  ADD COLUMN evaluatorVotes TEXT NULL AFTER evaluatorMode;

-- Add testSubmission (candidate's solution), testSubmittedAt, testConsensus
ALTER TABLE ExternalCandidate
  ADD COLUMN testSubmission TEXT NULL AFTER testDesign,
  ADD COLUMN testSubmittedAt DATETIME NULL AFTER testSubmission,
  ADD COLUMN testConsensus VARCHAR(20) NULL AFTER testPassed;
