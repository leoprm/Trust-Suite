-- CreateTable: Todo
CREATE TABLE `Todo` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `chatId` BIGINT NOT NULL,
    `messageId` BIGINT NOT NULL,
    `createdBy` BIGINT NOT NULL,
    `createdByName` VARCHAR(191) NULL,
    `text` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(191) NOT NULL,
    `likeCount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `Todo_treeId_chatId_idx`(`treeId`, `chatId`),
    INDEX `Todo_messageId_chatId_idx`(`messageId`, `chatId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign Key
ALTER TABLE `Todo` ADD CONSTRAINT `Todo_treeId_fkey`
    FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
