-- CreateTable
CREATE TABLE `UserWallet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `balanceClp` DOUBLE NOT NULL DEFAULT 0,
    `lockedClp` DOUBLE NOT NULL DEFAULT 0,
    `balanceBerries` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserWallet_userId_key`(`userId`),
    INDEX `UserWallet_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `walletId` VARCHAR(191) NOT NULL,
    `type` ENUM('DEPOSIT', 'WITHDRAWAL', 'P2P_TRANSFER', 'TREE_PAYMENT', 'MEMBER_REWARD', 'REFUND', 'LOCK', 'UNLOCK', 'FEE') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED') NOT NULL DEFAULT 'PENDING',
    `amount` DOUBLE NOT NULL,
    `currency` ENUM('CLP', 'BERRIES') NOT NULL DEFAULT 'CLP',
    `balanceBefore` DOUBLE NULL,
    `balanceAfter` DOUBLE NULL,
    `providerTxId` VARCHAR(191) NULL,
    `providerPayload` JSON NULL,
    `treeId` VARCHAR(191) NULL,
    `fromUserId` VARCHAR(191) NULL,
    `toUserId` VARCHAR(191) NULL,
    `metadataJson` JSON NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WalletTransaction_idempotencyKey_key`(`idempotencyKey`),
    INDEX `WalletTransaction_walletId_idx`(`walletId`),
    INDEX `WalletTransaction_type_idx`(`type`),
    INDEX `WalletTransaction_status_idx`(`status`),
    INDEX `WalletTransaction_treeId_idx`(`treeId`),
    INDEX `WalletTransaction_fromUserId_idx`(`fromUserId`),
    INDEX `WalletTransaction_toUserId_idx`(`toUserId`),
    INDEX `WalletTransaction_createdAt_idx`(`createdAt`),
    INDEX `WalletTransaction_idempotencyKey_idx`(`idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserWallet` ADD CONSTRAINT `UserWallet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `UserWallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_fromUserId_fkey` FOREIGN KEY (`fromUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
