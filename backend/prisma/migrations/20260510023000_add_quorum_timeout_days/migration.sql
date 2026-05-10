-- E12: quorumTimeoutDays configurable por Branch
ALTER TABLE `Branch` ADD COLUMN quorum_timeout_days INT NOT NULL DEFAULT 30;
