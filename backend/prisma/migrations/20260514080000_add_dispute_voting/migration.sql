-- Migration: Add Telegram dispute voting
-- Adds: Tree.telegramGroupId, DisputeMessage, TelegramDisputeVote

ALTER TABLE `Tree` ADD COLUMN `telegramGroupId` BIGINT NULL UNIQUE;

CREATE TABLE `DisputeMessage` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `treeId` VARCHAR(191) NOT NULL,
  `telegramMessageId` INT NOT NULL,
  `telegramGroupId` BIGINT NOT NULL,
  `status` ENUM('OPEN', 'RESOLVED_ACCEPTED', 'RESOLVED_REJECTED', 'EXPIRED') NOT NULL DEFAULT 'OPEN',
  `thumbsUp` INT NOT NULL DEFAULT 0,
  `thumbsDown` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_dispute_message_taskId` (`taskId`),
  INDEX `idx_dispute_message_treeId` (`treeId`),
  INDEX `idx_dispute_message_status` (`status`),
  INDEX `idx_dispute_message_tgmsg_tggroup` (`telegramMessageId`, `telegramGroupId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `TelegramDisputeVote` (
  `id` VARCHAR(191) NOT NULL,
  `disputeMessageId` VARCHAR(191) NOT NULL,
  `telegramUserId` BIGINT NOT NULL,
  `vote` ENUM('UP', 'DOWN') NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idx_tg_dispute_vote_unique` (`disputeMessageId`, `telegramUserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `DisputeMessage` ADD CONSTRAINT `fk_dispute_message_task` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE;
ALTER TABLE `DisputeMessage` ADD CONSTRAINT `fk_dispute_message_tree` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE;
ALTER TABLE `TelegramDisputeVote` ADD CONSTRAINT `fk_dispute_vote_message` FOREIGN KEY (`disputeMessageId`) REFERENCES `DisputeMessage`(`id`) ON DELETE CASCADE;
