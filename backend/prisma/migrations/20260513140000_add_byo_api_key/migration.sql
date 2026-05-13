-- CreateTable
CREATE TABLE `ByoApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT 'My Key',
    `provider` VARCHAR(191) NOT NULL,
    `apiKey` TEXT NOT NULL,
    `costPerToken` DOUBLE NOT NULL DEFAULT 0,
    `maxParallel` INTEGER NOT NULL DEFAULT 5,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ByoApiKey_userId_idx` ON `ByoApiKey`(`userId`);

-- CreateIndex
CREATE INDEX `ByoApiKey_userId_provider_idx` ON `ByoApiKey`(`userId`, `provider`);

-- AddForeignKey
ALTER TABLE `ByoApiKey` ADD CONSTRAINT `ByoApiKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
