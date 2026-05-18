-- CreateTable
CREATE TABLE `CandidateAnnouncement` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `telegramChatId` VARCHAR(191) NOT NULL,
    `announcementMsgId` INTEGER NOT NULL,
    `deadline` DATETIME(3) NOT NULL,
    `reminderSentAt` DATETIME(3) NULL,
    `reminderMsgId` INTEGER NULL,
    `pollId` VARCHAR(191) NULL,
    `pollMessageId` INTEGER NULL,
    `pollClosed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `CandidateAnnouncement_taskId_idx` ON `CandidateAnnouncement`(`taskId`);

-- CreateIndex
CREATE INDEX `CandidateAnnouncement_treeId_idx` ON `CandidateAnnouncement`(`treeId`);

-- CreateIndex
CREATE INDEX `CandidateAnnouncement_deadline_idx` ON `CandidateAnnouncement`(`deadline`);
