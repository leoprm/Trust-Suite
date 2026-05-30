-- AlterTable: Need
ALTER TABLE `Need` ADD COLUMN `cyclePhase` VARCHAR(191) NULL,
    ADD COLUMN `difficultyAvg` DOUBLE NULL,
    ADD COLUMN `pointsAllocation` JSON NULL,
    ADD COLUMN `previousRoundId` VARCHAR(191) NULL,
    ADD COLUMN `roundNumber` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `totalPoints` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `votingEndsAt` DATETIME(3) NULL;

-- AlterTable: TreeMember
ALTER TABLE `TreeMember` DROP COLUMN `dailyPoints`,
    ADD COLUMN `cyclePoints` INTEGER NOT NULL DEFAULT 25,
    ADD COLUMN `cyclePointsRefillAt` DATETIME(3) NULL;

-- CreateTable: NeedVote
CREATE TABLE `NeedVote` (
    `id` VARCHAR(191) NOT NULL,
    `needId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NeedVote_needId_userId_key`(`needId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NeedVote` ADD CONSTRAINT `NeedVote_needId_fkey` FOREIGN KEY (`needId`) REFERENCES `Need`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
