-- CreateTable
CREATE TABLE `SkillInfluence` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `skillTag` VARCHAR(191) NOT NULL,
    `greenAvgDifficulty` DOUBLE NOT NULL DEFAULT 0,
    `goldenAvgDifficulty` DOUBLE NOT NULL DEFAULT 0,
    `greenInfluence` DOUBLE NOT NULL DEFAULT 20,
    `goldenInfluence` DOUBLE NOT NULL DEFAULT 20,
    `finalInfluence` DOUBLE NOT NULL DEFAULT 20,
    `calculatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SkillInfluence_treeId_skillTag_key`(`treeId`, `skillTag`),
    INDEX `SkillInfluence_skillTag_idx`(`skillTag`),
    INDEX `SkillInfluence_calculatedAt_idx`(`calculatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SkillInfluence` ADD CONSTRAINT `SkillInfluence_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
