-- CreateTable
CREATE TABLE `EvidenceFile` (
    `id` VARCHAR(191) NOT NULL,
    `uploaderId` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `auditId` VARCHAR(191) NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `storedName` VARCHAR(191) NOT NULL,
    `storagePath` TEXT NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `extension` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `visibility` ENUM('PRIVATE', 'TASK_PARTICIPANTS', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC_METADATA', 'PUBLIC') NOT NULL DEFAULT 'TASK_PARTICIPANTS',
    `status` ENUM('ACTIVE', 'DELETED', 'QUARANTINED') NOT NULL DEFAULT 'ACTIVE',
    `checksumSha256` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EvidenceFile_uploaderId_idx`(`uploaderId`),
    INDEX `EvidenceFile_treeId_idx`(`treeId`),
    INDEX `EvidenceFile_taskId_idx`(`taskId`),
    INDEX `EvidenceFile_visibility_idx`(`visibility`),
    INDEX `EvidenceFile_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_uploaderId_fkey` FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
