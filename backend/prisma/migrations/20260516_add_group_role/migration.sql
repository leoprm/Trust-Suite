-- GroupRole: Ari's role recommender — organizational roles per group type
CREATE TABLE IF NOT EXISTS `GroupRole` (
  `id` VARCHAR(191) NOT NULL,
  `groupType` VARCHAR(191) NOT NULL,
  `roleName` VARCHAR(191) NOT NULL,
  `typicalCount` INT NOT NULL DEFAULT 1,
  `ratioToMembers` DOUBLE NULL,
  `requiredSkills` TEXT NULL,
  `avgLoad` INT NULL,
  `occurrences` INT NOT NULL DEFAULT 1,
  `source` VARCHAR(191) NOT NULL DEFAULT 'seed',
  `lastConfirmedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `GroupRole_groupType_idx` (`groupType`),
  INDEX `GroupRole_roleName_idx` (`roleName`),
  UNIQUE INDEX `GroupRole_groupType_roleName_key` (`groupType`, `roleName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
