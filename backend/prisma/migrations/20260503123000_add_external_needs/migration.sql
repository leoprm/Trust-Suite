-- CreateTable
CREATE TABLE `ExternalNeed` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'OPEN', 'UNDER_REVIEW', 'SOLUTIONS_PROPOSED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_TASKS', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `clientSummary` TEXT NULL,
    `desiredOutcome` TEXT NULL,
    `constraints` TEXT NULL,
    `deadline` DATETIME(3) NULL,
    `budgetMinFiat` DOUBLE NULL,
    `budgetMaxFiat` DOUBLE NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'CLP',
    `visibility` ENUM('PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC_METADATA', 'PUBLIC') NOT NULL DEFAULT 'TREE_ONLY',
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExternalNeed_treeId_idx`(`treeId`),
    INDEX `ExternalNeed_status_idx`(`status`),
    INDEX `ExternalNeed_createdById_idx`(`createdById`),
    INDEX `ExternalNeed_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExternalAgent` (
    `id` VARCHAR(191) NOT NULL,
    `externalNeedId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `organization` VARCHAR(191) NULL,
    `role` ENUM('CLIENT', 'SPONSOR', 'CONTACT', 'APPROVER', 'OBSERVER') NOT NULL DEFAULT 'CLIENT',
    `notes` TEXT NULL,
    `consentAccepted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExternalAgent_externalNeedId_idx`(`externalNeedId`),
    INDEX `ExternalAgent_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScopePreference` (
    `id` VARCHAR(191) NOT NULL,
    `externalNeedId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ScopePreference_externalNeedId_idx`(`externalNeedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SolutionProposal` (
    `id` VARCHAR(191) NOT NULL,
    `externalNeedId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED_BY_TREE', 'APPROVED_BY_CLIENT', 'REJECTED', 'SELECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `estimatedFiatMin` DOUBLE NULL,
    `estimatedFiatMax` DOUBLE NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'CLP',
    `estimatedBerries` INTEGER NULL,
    `estimatedDurationDays` INTEGER NULL,
    `riskLevel` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `assumptions` TEXT NULL,
    `included` TEXT NULL,
    `excluded` TEXT NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SolutionProposal_externalNeedId_idx`(`externalNeedId`),
    INDEX `SolutionProposal_createdById_idx`(`createdById`),
    INDEX `SolutionProposal_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ExternalNeed` ADD CONSTRAINT `ExternalNeed_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExternalNeed` ADD CONSTRAINT `ExternalNeed_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExternalAgent` ADD CONSTRAINT `ExternalAgent_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScopePreference` ADD CONSTRAINT `ScopePreference_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolutionProposal` ADD CONSTRAINT `SolutionProposal_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolutionProposal` ADD CONSTRAINT `SolutionProposal_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
