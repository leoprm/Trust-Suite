-- Create PenaltyType enum (MySQL doesn't have native enums, using VARCHAR)
-- AgentIntervention table
CREATE TABLE IF NOT EXISTS `AgentIntervention` (
  `id` VARCHAR(191) NOT NULL,
  `agentId` VARCHAR(191) NOT NULL,
  `treeId` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `taskId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `AgentIntervention_agentId_treeId_idx` (`agentId`, `treeId`),
  INDEX `AgentIntervention_treeId_createdAt_idx` (`treeId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AgentInterventionRating table
CREATE TABLE IF NOT EXISTS `AgentInterventionRating` (
  `id` VARCHAR(191) NOT NULL,
  `interventionId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `useful` TINYINT(1) NOT NULL DEFAULT 0,
  `annoying` TINYINT(1) NOT NULL DEFAULT 0,
  `correct` TINYINT(1) NOT NULL DEFAULT 0,
  `comment` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AgentInterventionRating_interventionId_userId_key` (`interventionId`, `userId`),
  INDEX `AgentInterventionRating_interventionId_idx` (`interventionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AgentPenaltyVote table
CREATE TABLE IF NOT EXISTS `AgentPenaltyVote` (
  `id` VARCHAR(191) NOT NULL,
  `interventionId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `penalty` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AgentPenaltyVote_interventionId_userId_key` (`interventionId`, `userId`),
  INDEX `AgentPenaltyVote_interventionId_idx` (`interventionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
