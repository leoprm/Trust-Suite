-- TransactionLedger: audit trail for all balance movements
CREATE TABLE `TransactionLedger` (
  `id` VARCHAR(191) NOT NULL,
  `treeId` VARCHAR(191) NOT NULL,
  `memberId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `amount` INT NOT NULL,
  `description` VARCHAR(191) NULL,
  `stripeReference` VARCHAR(191) NULL,
  `metadataJson` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `TransactionLedger_treeId_idx` (`treeId`),
  INDEX `TransactionLedger_memberId_idx` (`memberId`),
  INDEX `TransactionLedger_treeId_createdAt_idx` (`treeId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FOREIGN KEYS
ALTER TABLE `TransactionLedger` ADD CONSTRAINT `TransactionLedger_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TransactionLedger` ADD CONSTRAINT `TransactionLedger_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `TreeMember`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
