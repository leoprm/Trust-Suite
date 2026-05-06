CREATE TABLE `PrivacySettings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `traceProfileVisibility` ENUM('PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC') NOT NULL DEFAULT 'TREE_ONLY',
    `taskHistoryVisibility` ENUM('PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `evidenceVisibility` ENUM('PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `showInTalentSearch` BOOLEAN NOT NULL DEFAULT false,
    `allowAggregatedMetrics` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PrivacySettings_userId_key`(`userId`),
    INDEX `PrivacySettings_traceProfileVisibility_idx`(`traceProfileVisibility`),
    INDEX `PrivacySettings_showInTalentSearch_idx`(`showInTalentSearch`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PrivacySettings` ADD CONSTRAINT `PrivacySettings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
