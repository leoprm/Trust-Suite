-- Extend External Need solution proposals with budget ranges, selection metadata and budget lines.
-- Money remains DOUBLE for compatibility with the existing Fiat ledger. Future accounting hardening should migrate to DECIMAL.

ALTER TABLE `SolutionProposal`
  MODIFY `status` ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED_BY_TREE','APPROVED_BY_CLIENT','REJECTED','SELECTED','ARCHIVED','CONVERTED_TO_TASKS') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `estimatedFiatExpected` DOUBLE NULL,
  ADD COLUMN `deliverables` TEXT NULL,
  ADD COLUMN `acceptanceCriteria` TEXT NULL,
  ADD COLUMN `maintenanceNotes` TEXT NULL,
  ADD COLUMN `scopeAlignmentJson` JSON NULL,
  ADD COLUMN `selectedAt` DATETIME(3) NULL,
  ADD COLUMN `selectedById` VARCHAR(191) NULL,
  ADD COLUMN `approvedByClientAt` DATETIME(3) NULL,
  ADD COLUMN `approvedByTreeAt` DATETIME(3) NULL;

CREATE INDEX `SolutionProposal_riskLevel_idx` ON `SolutionProposal`(`riskLevel`);
CREATE INDEX `SolutionProposal_selectedById_idx` ON `SolutionProposal`(`selectedById`);

CREATE TABLE `BudgetLine` (
  `id`                 VARCHAR(191) NOT NULL,
  `solutionProposalId` VARCHAR(191) NOT NULL,
  `label`              VARCHAR(191) NOT NULL,
  `description`        TEXT NULL,
  `type`               ENUM('LABOR','MATERIALS','INFRASTRUCTURE','TAXES','RESERVE','TREE_FUND','MAINTENANCE','EXTERNAL_SERVICE','OTHER') NOT NULL,
  `estimatedFiat`      DOUBLE NULL,
  `estimatedBerries`   INT NULL,
  `currency`           VARCHAR(191) NULL DEFAULT 'CLP',
  `quantity`           DOUBLE NULL,
  `unit`               VARCHAR(191) NULL,
  `unitCostFiat`       DOUBLE NULL,
  `createdAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`          DATETIME(3) NOT NULL,

  INDEX `BudgetLine_solutionProposalId_idx`(`solutionProposalId`),
  INDEX `BudgetLine_type_idx`(`type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SolutionProposal` ADD CONSTRAINT `SolutionProposal_selectedById_fkey` FOREIGN KEY (`selectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `BudgetLine` ADD CONSTRAINT `BudgetLine_solutionProposalId_fkey` FOREIGN KEY (`solutionProposalId`) REFERENCES `SolutionProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
