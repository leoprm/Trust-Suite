-- CreateTable AgentProfile
CREATE TABLE `AgentProfile` (
    `agentId` VARCHAR(191) NOT NULL,
    `totalRatings` INTEGER NOT NULL DEFAULT 0,
    `avgStars` DOUBLE NOT NULL DEFAULT 0,
    `xpByRole` JSON NOT NULL DEFAULT ('{}'),
    `primaryRole` VARCHAR(191) NULL,
    `secondaryRole` VARCHAR(191) NULL,
    `confidenceScore` DOUBLE NOT NULL DEFAULT 0,
    `lastActiveAt` DATETIME(3) NULL,
    `explorationEligible` BOOLEAN NOT NULL DEFAULT TRUE,
    `currentTreeCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`agentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable AgentRoleHistory
CREATE TABLE `AgentRoleHistory` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `releasedAt` DATETIME(3) NULL,
    `assignmentReason` VARCHAR(191) NOT NULL,
    `performanceScore` DOUBLE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable Rating
ALTER TABLE `Rating` ADD COLUMN `crossTreeContribution` BOOLEAN NOT NULL DEFAULT TRUE;

-- AddForeignKey AgentProfile
ALTER TABLE `AgentProfile` ADD CONSTRAINT `AgentProfile_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey AgentRoleHistory
ALTER TABLE `AgentRoleHistory` ADD CONSTRAINT `AgentRoleHistory_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey AgentRoleHistory
ALTER TABLE `AgentRoleHistory` ADD CONSTRAINT `AgentRoleHistory_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex AgentRoleHistory
CREATE INDEX `AgentRoleHistory_agentId_idx` ON `AgentRoleHistory`(`agentId`);

-- CreateIndex AgentRoleHistory
CREATE INDEX `AgentRoleHistory_treeId_idx` ON `AgentRoleHistory`(`treeId`);

-- CreateIndex AgentRoleHistory
CREATE INDEX `AgentRoleHistory_agentId_treeId_idx` ON `AgentRoleHistory`(`agentId`, `treeId`);
