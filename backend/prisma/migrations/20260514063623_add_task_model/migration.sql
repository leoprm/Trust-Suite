-- CreateTable
CREATE TABLE `Task` (
  `id` VARCHAR(191) NOT NULL,
  `treeId` VARCHAR(191) NOT NULL,
  `needId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `budget` INTEGER NOT NULL,
  `status` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'VERIFIED', 'PAID', 'DISPUTED') NOT NULL DEFAULT 'PENDING',
  `assigneeId` VARCHAR(191) NULL,
  `creatorId` VARCHAR(191) NOT NULL,
  `skills` VARCHAR(191) NULL,
  `evidenceUrl` VARCHAR(191) NULL,
  `evidenceType` VARCHAR(191) NULL,
  `disputedById` VARCHAR(191) NULL,
  `disputeReason` VARCHAR(191) NULL,
  `disputeEvidenceUrl` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `Task_treeId_idx`(`treeId`),
  INDEX `Task_assigneeId_idx`(`assigneeId`),
  INDEX `Task_status_idx`(`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Task` ADD CONSTRAINT `Task_needId_fkey` FOREIGN KEY (`needId`) REFERENCES `Need`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Task` ADD CONSTRAINT `Task_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Task` ADD CONSTRAINT `Task_disputedById_fkey` FOREIGN KEY (`disputedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
