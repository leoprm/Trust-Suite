-- Add Waitlist table for beta capacity gate
CREATE TABLE IF NOT EXISTS `Waitlist` (
  `id` VARCHAR(191) NOT NULL,
  `treeName` VARCHAR(191) NOT NULL,
  `telegramChatId` VARCHAR(191) NOT NULL,
  `contactUserId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'WAITING',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notifiedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `Waitlist_status_idx` (`status`),
  INDEX `Waitlist_contactUserId_idx` (`contactUserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
