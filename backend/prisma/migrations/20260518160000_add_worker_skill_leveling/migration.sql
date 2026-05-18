-- AlterTable
ALTER TABLE `ExternalTask` ADD COLUMN `difficulty` INTEGER NULL DEFAULT 5,
    ADD COLUMN `quality` DOUBLE NULL;

-- CreateTable
CREATE TABLE `WorkerSkill` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `skill` VARCHAR(191) NOT NULL,
    `xp` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkerLevelHistory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `skill` VARCHAR(191) NOT NULL,
    `xpDelta` INTEGER NOT NULL,
    `reason` ENUM('TASK_COMPLETED', 'XP_DECAY', 'ADMIN_ADJUST') NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `WorkerSkill_userId_skill_key` ON `WorkerSkill`(`userId`, `skill`);

-- CreateIndex
CREATE INDEX `WorkerSkill_userId_idx` ON `WorkerSkill`(`userId`);

-- CreateIndex
CREATE INDEX `WorkerLevelHistory_userId_idx` ON `WorkerLevelHistory`(`userId`);

-- CreateIndex
CREATE INDEX `WorkerLevelHistory_userId_skill_createdAt_idx` ON `WorkerLevelHistory`(`userId`, `skill`, `createdAt`);

-- AddForeignKey
ALTER TABLE `WorkerSkill` ADD CONSTRAINT `WorkerSkill_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkerLevelHistory` ADD CONSTRAINT `WorkerLevelHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
