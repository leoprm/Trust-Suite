-- Separate fiat as an external ledger and add Tree economy mode.
-- Existing amounts stay as DOUBLE for compatibility; Decimal migration is deferred.

ALTER TABLE `Tree`
  ADD COLUMN `economyMode` ENUM('NO_ECONOMY','LEGACY_FIAT','BERRIES_LATENT','BERRIES_ACTIVE','TRUST_FULL') NOT NULL DEFAULT 'NO_ECONOMY';

ALTER TABLE `FiatTransaction`
  ADD COLUMN `taskId` VARCHAR(191) NULL,
  ADD COLUMN `externalNeedId` VARCHAR(191) NULL,
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'CLP',
  ADD COLUMN `verificationStatus` ENUM('DECLARED','BACKED_BY_RECEIPT','RECONCILED','AUDITED','API_VERIFIED') NOT NULL DEFAULT 'DECLARED',
  ADD COLUMN `receiptEvidenceId` VARCHAR(191) NULL,
  ADD COLUMN `metadataJson` JSON NULL,
  ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE INDEX `FiatTransaction_treeId_idx` ON `FiatTransaction`(`treeId`);
CREATE INDEX `FiatTransaction_branchId_idx` ON `FiatTransaction`(`branchId`);
CREATE INDEX `FiatTransaction_taskId_idx` ON `FiatTransaction`(`taskId`);
CREATE INDEX `FiatTransaction_type_idx` ON `FiatTransaction`(`type`);
CREATE INDEX `FiatTransaction_verificationStatus_idx` ON `FiatTransaction`(`verificationStatus`);
CREATE INDEX `FiatTransaction_date_idx` ON `FiatTransaction`(`date`);
