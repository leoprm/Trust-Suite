-- CreateTable
CREATE TABLE `Rating` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `stars` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Rating_agentId_treeId_idx` ON `Rating`(`agentId`, `treeId`);

-- CreateIndex
CREATE INDEX `Rating_taskId_idx` ON `Rating`(`taskId`);

-- AddForeignKey
ALTER TABLE `Rating` ADD CONSTRAINT `Rating_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rating` ADD CONSTRAINT `Rating_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rating` ADD CONSTRAINT `Rating_agentId_treeId_fkey` FOREIGN KEY (`agentId`, `treeId`) REFERENCES `AgentMembership`(`agentId`, `treeId`) ON DELETE CASCADE ON UPDATE CASCADE;
