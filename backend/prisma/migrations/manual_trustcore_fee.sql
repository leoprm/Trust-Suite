-- TrustCore Fee Protocol — Migration
-- Run against trust_web database

-- 1. Add columns to Tree
ALTER TABLE `Tree` ADD COLUMN `isTrustCore` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Tree` ADD COLUMN `trustCoreBalanceClp` DOUBLE NOT NULL DEFAULT 0;

-- 2. Create TrustCoreConfig table
CREATE TABLE `TrustCoreConfig` (
  `id` VARCHAR(191) NOT NULL,
  `treeId` VARCHAR(191) NOT NULL,
  `maintenanceShare` DOUBLE NOT NULL DEFAULT 0.70,
  `growthShare` DOUBLE NOT NULL DEFAULT 0.30,
  `monthlyMaintenanceCost` DOUBLE NOT NULL DEFAULT 0,
  `totalFeesCollected` DOUBLE NOT NULL DEFAULT 0,
  `totalFeesDistributed` DOUBLE NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `activatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deactivatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TrustCoreConfig_treeId_key` (`treeId`),
  INDEX `TrustCoreConfig_isActive_idx` (`isActive`),
  CONSTRAINT `TrustCoreConfig_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create GlobalFeeConfig table
CREATE TABLE `GlobalFeeConfig` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'default',
  `baseMaintenanceCostClp` DOUBLE NOT NULL DEFAULT 500000,
  `growthFactor` DOUBLE NOT NULL DEFAULT 0.02,
  `minFeePercent` DOUBLE NOT NULL DEFAULT 0.5,
  `maxFeePercent` DOUBLE NOT NULL DEFAULT 5.0,
  `currentFeePercent` DOUBLE NOT NULL DEFAULT 0.5,
  `maintenanceComponent` DOUBLE NOT NULL DEFAULT 0.35,
  `growthComponent` DOUBLE NOT NULL DEFAULT 0.15,
  `lastRecalculatedAt` DATETIME(3) NULL,
  `totalActiveUsers` INT NOT NULL DEFAULT 0,
  `totalMonthlyVolumeClp` DOUBLE NOT NULL DEFAULT 0,
  `totalActiveTrees` INT NOT NULL DEFAULT 0,
  `totalTrustCoreTrees` INT NOT NULL DEFAULT 0,
  `systemMetricsUpdatedAt` DATETIME(3) NULL,
  `serverAdminIds` JSON NOT NULL DEFAULT ('[]'),
  `recalculationIntervalHours` INT NOT NULL DEFAULT 6,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create FeeDistribution table
CREATE TABLE `FeeDistribution` (
  `id` VARCHAR(191) NOT NULL,
  `walletTransactionId` VARCHAR(191) NOT NULL,
  `trustCoreTreeId` VARCHAR(191) NOT NULL,
  `amount` DOUBLE NOT NULL,
  `totalFeeAmount` DOUBLE NOT NULL,
  `splitRatio` DOUBLE NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `FeeDistribution_trustCoreTreeId_idx` (`trustCoreTreeId`),
  INDEX `FeeDistribution_walletTransactionId_idx` (`walletTransactionId`),
  INDEX `FeeDistribution_createdAt_idx` (`createdAt`),
  CONSTRAINT `FeeDistribution_walletTransactionId_fkey` FOREIGN KEY (`walletTransactionId`) REFERENCES `WalletTransaction` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FeeDistribution_trustCoreTreeId_fkey` FOREIGN KEY (`trustCoreTreeId`) REFERENCES `Tree` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. If FEE enum value doesn't exist, the Prisma client already handles it
--    (WalletTransactionType is an enum in Prisma, MySQL uses VARCHAR)
