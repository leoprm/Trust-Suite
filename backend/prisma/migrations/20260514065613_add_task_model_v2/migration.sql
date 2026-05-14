-- DropForeignKey
ALTER TABLE `Task` DROP FOREIGN KEY `Task_needId_fkey`;

-- DropForeignKey
ALTER TABLE `Task` DROP FOREIGN KEY `Task_assignedTo_fkey`;

-- AlterTable
ALTER TABLE `Task` DROP COLUMN `assignedTo`,
    DROP COLUMN `difficulty`,
    ADD COLUMN `assigneeId` VARCHAR(191) NULL,
    ADD COLUMN `budget` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `creatorId` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `disputeEvidenceUrl` VARCHAR(191) NULL,
    ADD COLUMN `disputeReason` VARCHAR(191) NULL,
    ADD COLUMN `disputedById` VARCHAR(191) NULL,
    ADD COLUMN `evidenceType` VARCHAR(191) NULL,
    ADD COLUMN `evidenceUrl` VARCHAR(191) NULL,
    ADD COLUMN `skills` VARCHAR(191) NULL,
    MODIFY `needId` VARCHAR(191) NOT NULL,
    MODIFY `description` TEXT NULL,
    MODIFY `status` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'VERIFIED', 'PAID', 'DISPUTED') NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX `Task_assigneeId_idx` ON `Task`(`assigneeId`);

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_needId_fkey` FOREIGN KEY (`needId`) REFERENCES `Need`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
