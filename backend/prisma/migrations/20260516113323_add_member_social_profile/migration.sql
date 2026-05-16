-- Create MemberSocialProfile table
CREATE TABLE IF NOT EXISTS `MemberSocialProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `treeId` VARCHAR(191) NOT NULL,
  `proposedNeedTopics` JSON NOT NULL,
  `votingPatterns` JSON NOT NULL,
  `taskCompletionRate` DOUBLE NOT NULL DEFAULT 0,
  `chatActivity` JSON NOT NULL,
  `contributionSummary` TEXT NULL,
  `lastAnalyzedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MemberSocialProfile_userId_treeId_key`(`userId`, `treeId`),
  INDEX `MemberSocialProfile_treeId_idx`(`treeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FOREIGN KEYS
ALTER TABLE `MemberSocialProfile` ADD CONSTRAINT `MemberSocialProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MemberSocialProfile` ADD CONSTRAINT `MemberSocialProfile_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
