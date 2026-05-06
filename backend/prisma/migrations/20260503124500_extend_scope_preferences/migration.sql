-- AlterTable
ALTER TABLE `ScopePreference`
  ADD COLUMN `agentId` VARCHAR(191) NULL,
  ADD COLUMN `labelKey` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `normalizedWeight` DOUBLE NULL,
  ADD COLUMN `createdById` VARCHAR(191) NULL;

-- Backfill normalized label key for existing rows.
UPDATE `ScopePreference`
SET `labelKey` = LOWER(TRIM(`label`))
WHERE `labelKey` = '';

-- CreateIndex
CREATE INDEX `ScopePreference_agentId_idx` ON `ScopePreference`(`agentId`);
CREATE INDEX `ScopePreference_label_idx` ON `ScopePreference`(`label`);
CREATE INDEX `ScopePreference_labelKey_idx` ON `ScopePreference`(`labelKey`);
CREATE INDEX `ScopePreference_createdById_idx` ON `ScopePreference`(`createdById`);

-- AddForeignKey
ALTER TABLE `ScopePreference` ADD CONSTRAINT `ScopePreference_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `ExternalAgent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScopePreference` ADD CONSTRAINT `ScopePreference_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
