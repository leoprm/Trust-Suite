-- ExpertEndorsement table
CREATE TABLE `ExpertEndorsement` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `endorserId` VARCHAR(191) NOT NULL,
    `endorsedId` VARCHAR(191) NOT NULL,
    `expertise` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'SUCCESS', 'FAILED_PERFORMANCE', 'FAILED_FRAUD') NOT NULL DEFAULT 'ACTIVE',
    `requiredTasks` INT NOT NULL DEFAULT 3,
    `completedTasks` INT NOT NULL DEFAULT 0,
    `satisfactionThreshold` DOUBLE NOT NULL DEFAULT 80,
    `avgSatisfaction` DOUBLE NULL,
    `boostApplied` BOOLEAN NOT NULL DEFAULT true,
    `evidenceTaskIds` TEXT NOT NULL DEFAULT ('[]'),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolutionNote` TEXT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `ExpertEndorsement_endorserId_endorsedId_treeId_expertise_key`(`endorserId`, `endorsedId`, `treeId`, `expertise`),
    INDEX `ExpertEndorsement_treeId_endorserId_status_idx`(`treeId`, `endorserId`, `status`),
    INDEX `ExpertEndorsement_treeId_endorsedId_status_idx`(`treeId`, `endorsedId`, `status`),
    INDEX `ExpertEndorsement_treeId_expertise_status_idx`(`treeId`, `expertise`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FK constraints
ALTER TABLE `ExpertEndorsement` ADD CONSTRAINT `ExpertEndorsement_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ExpertEndorsement` ADD CONSTRAINT `ExpertEndorsement_endorserId_fkey` FOREIGN KEY (`endorserId`) REFERENCES `TreeMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ExpertEndorsement` ADD CONSTRAINT `ExpertEndorsement_endorsedId_fkey` FOREIGN KEY (`endorsedId`) REFERENCES `TreeMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ExpertEndorsement` ADD CONSTRAINT `ExpertEndorsement_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
