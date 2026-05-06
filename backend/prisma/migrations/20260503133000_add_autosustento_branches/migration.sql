-- Add Autosustento Branches as external sustainability branches.
-- Money remains DOUBLE for compatibility with the existing Fiat ledger. Future accounting hardening should migrate to DECIMAL.

ALTER TABLE `Branch`
  ADD COLUMN `type` ENUM('NORMAL','HASHTAG','AUTOSUSTENTO','EXTERNAL_CONTRACT') NOT NULL DEFAULT 'NORMAL';

UPDATE `Branch` SET `type` = 'HASHTAG' WHERE `isHashtag` = true;

CREATE INDEX `Branch_treeId_idx` ON `Branch`(`treeId`);
CREATE INDEX `Branch_type_idx` ON `Branch`(`type`);

CREATE TABLE `AutosustentoBranchConfig` (
  `id`                        VARCHAR(191) NOT NULL,
  `branchId`                  VARCHAR(191) NOT NULL,
  `treeId`                    VARCHAR(191) NOT NULL,
  `businessName`              VARCHAR(191) NULL,
  `productOrService`          VARCHAR(191) NOT NULL,
  `targetClient`              TEXT NULL,
  `valueProposition`          TEXT NULL,
  `status`                    ENUM('PROPOSED','UNDER_REVIEW','APPROVED','ACTIVE','PAUSED','REJECTED','CLOSED') NOT NULL DEFAULT 'PROPOSED',
  `viabilitySummary`          TEXT NULL,
  `requiredResources`         TEXT NULL,
  `legalRisks`                TEXT NULL,
  `operationalRisks`          TEXT NULL,
  `startupCostFiat`           DOUBLE NULL,
  `expectedMonthlyIncomeFiat` DOUBLE NULL,
  `expectedMonthlyCostFiat`   DOUBLE NULL,
  `currency`                  VARCHAR(191) NULL DEFAULT 'CLP',
  `reviewPeriodDays`          INT NULL DEFAULT 90,
  `nextReviewAt`              DATETIME(3) NULL,
  `closureCriteria`           TEXT NULL,
  `metadataJson`              JSON NULL,
  `createdById`               VARCHAR(191) NULL,
  `createdAt`                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`                 DATETIME(3) NOT NULL,

  UNIQUE INDEX `AutosustentoBranchConfig_branchId_key`(`branchId`),
  INDEX `AutosustentoBranchConfig_treeId_idx`(`treeId`),
  INDEX `AutosustentoBranchConfig_status_idx`(`status`),
  INDEX `AutosustentoBranchConfig_createdById_idx`(`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SustainabilitySplit` (
  `id`             VARCHAR(191) NOT NULL,
  `configId`       VARCHAR(191) NOT NULL,
  `materialsPct`   DOUBLE NOT NULL DEFAULT 0,
  `laborPct`       DOUBLE NOT NULL DEFAULT 0,
  `operationsPct`  DOUBLE NOT NULL DEFAULT 0,
  `taxPct`         DOUBLE NOT NULL DEFAULT 0,
  `reservePct`     DOUBLE NOT NULL DEFAULT 0,
  `maintenancePct` DOUBLE NOT NULL DEFAULT 0,
  `treeFundPct`    DOUBLE NOT NULL DEFAULT 0,
  `otherPct`       DOUBLE NOT NULL DEFAULT 0,
  `notes`          TEXT NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,

  UNIQUE INDEX `SustainabilitySplit_configId_key`(`configId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AutosustentoBranchConfig` ADD CONSTRAINT `AutosustentoBranchConfig_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AutosustentoBranchConfig` ADD CONSTRAINT `AutosustentoBranchConfig_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AutosustentoBranchConfig` ADD CONSTRAINT `AutosustentoBranchConfig_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SustainabilitySplit` ADD CONSTRAINT `SustainabilitySplit_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `AutosustentoBranchConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
