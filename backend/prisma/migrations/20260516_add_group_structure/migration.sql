-- CreateTable: GroupStructure
CREATE TABLE `GroupStructure` (
    `id` VARCHAR(191) NOT NULL,
    `groupType` VARCHAR(191) NOT NULL,
    `typicalSubTrees` JSON NOT NULL,
    `budgetAllocation` JSON NULL,
    `capitalInicial` DOUBLE NULL,
    `roiMonth` INTEGER NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'seed',
    `usageCount` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GroupStructure_groupType_key`(`groupType`),
    INDEX `GroupStructure_groupType_idx`(`groupType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: GroupMilestone
CREATE TABLE `GroupMilestone` (
    `id` VARCHAR(191) NOT NULL,
    `groupType` VARCHAR(191) NOT NULL,
    `phase` INTEGER NOT NULL,
    `phaseName` VARCHAR(191) NOT NULL,
    `objectives` JSON NOT NULL,
    `expectedMonths` INTEGER NOT NULL,
    `targetKPIs` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GroupMilestone_groupType_phase_key`(`groupType`, `phase`),
    INDEX `GroupMilestone_groupType_phase_idx`(`groupType`, `phase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: TreeStructure
CREATE TABLE `TreeStructure` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `groupType` VARCHAR(191) NOT NULL,
    `subTrees` JSON NOT NULL,
    `totalBudget` DOUBLE NULL,
    `capitalInicial` DOUBLE NULL,
    `roiEstimate` JSON NULL,
    `breakEvenEstimate` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `adoptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(191) NULL,

    UNIQUE INDEX `TreeStructure_treeId_key`(`treeId`),
    INDEX `TreeStructure_treeId_idx`(`treeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: TreeMilestone
CREATE TABLE `TreeMilestone` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `structureId` VARCHAR(191) NOT NULL,
    `phase` INTEGER NOT NULL,
    `phaseName` VARCHAR(191) NOT NULL,
    `objectives` JSON NOT NULL,
    `targetDate` DATETIME(3) NOT NULL,
    `targetKPIs` JSON NOT NULL,
    `actualKPIs` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `needId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TreeMilestone_structureId_phase_key`(`structureId`, `phase`),
    INDEX `TreeMilestone_structureId_idx`(`structureId`),
    INDEX `TreeMilestone_treeId_phase_idx`(`treeId`, `phase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: TreeExpense
CREATE TABLE `TreeExpense` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `structureId` VARCHAR(191) NULL,
    `subTreeName` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActual` BOOLEAN NOT NULL DEFAULT false,
    `incurredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TreeExpense_treeId_idx`(`treeId`),
    INDEX `TreeExpense_structureId_idx`(`structureId`),
    INDEX `TreeExpense_treeId_subTreeName_idx`(`treeId`, `subTreeName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FOREIGN KEYS
ALTER TABLE `GroupMilestone` ADD CONSTRAINT `GroupMilestone_groupType_fkey`
    FOREIGN KEY (`groupType`) REFERENCES `GroupStructure`(`groupType`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TreeStructure` ADD CONSTRAINT `TreeStructure_treeId_fkey`
    FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TreeStructure` ADD CONSTRAINT `TreeStructure_groupType_fkey`
    FOREIGN KEY (`groupType`) REFERENCES `GroupStructure`(`groupType`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TreeMilestone` ADD CONSTRAINT `TreeMilestone_structureId_fkey`
    FOREIGN KEY (`structureId`) REFERENCES `TreeStructure`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TreeExpense` ADD CONSTRAINT `TreeExpense_structureId_fkey`
    FOREIGN KEY (`structureId`) REFERENCES `TreeStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
