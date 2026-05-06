-- DropIndex skipped for MySQL: `DifficultyVote_taskId_userId_key` is needed by a foreign key constraint.

-- AlterTable
ALTER TABLE `Branch` ADD COLUMN `esVotable` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `valorOficial` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `valorSugerido` DOUBLE NULL;

-- AlterTable
ALTER TABLE `BranchMember` MODIFY `joinedPhases` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `FiatTemplate` MODIFY `type` ENUM('INCOME', 'EXPENSE', 'INVESTMENT', 'SALARY', 'MATERIALS', 'INFRASTRUCTURE', 'TAX', 'RESERVE', 'MAINTENANCE', 'TREE_FUND', 'EXTERNAL_CONTRACT', 'REFUND') NOT NULL;

-- AlterTable
ALTER TABLE `FiatTransaction` ADD COLUMN `certifiedAt` DATETIME(3) NULL,
    ADD COLUMN `certifiedById` VARCHAR(191) NULL,
    ADD COLUMN `counterpartyName` TEXT NULL,
    ADD COLUMN `counterpartyType` ENUM('CLIENT', 'SUPPLIER', 'MEMBER', 'EXTERNAL_WORKER', 'INSTITUTION', 'OTHER') NULL,
    ADD COLUMN `isAutomatic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `rejectionReason` TEXT NULL,
    ADD COLUMN `solutionProposalId` VARCHAR(191) NULL,
    MODIFY `type` ENUM('INCOME', 'EXPENSE', 'INVESTMENT', 'SALARY', 'MATERIALS', 'INFRASTRUCTURE', 'TAX', 'RESERVE', 'MAINTENANCE', 'TREE_FUND', 'EXTERNAL_CONTRACT', 'REFUND') NOT NULL,
    MODIFY `verificationStatus` ENUM('DECLARED', 'BACKED_BY_RECEIPT', 'RECONCILED', 'AUDITED', 'API_VERIFIED', 'REJECTED') NOT NULL DEFAULT 'DECLARED',
    ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `ScopePreference` ALTER COLUMN `labelKey` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `auditada` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `completionComment` TEXT NULL,
    ADD COLUMN `completionPhotoUrl` TEXT NULL,
    ADD COLUMN `deadlineAt` DATETIME(3) NULL,
    ADD COLUMN `startPhotoUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `Tree` ADD COLUMN `capacidades` TEXT NOT NULL,
    ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `country` VARCHAR(191) NULL,
    ADD COLUMN `creacionRamaComunitaria` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `creacionRamaDirecta` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `crisisExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `crisisSubjects` TEXT NOT NULL,
    ADD COLUMN `direccionExacta` VARCHAR(191) NULL,
    ADD COLUMN `fachadaUrl` TEXT NULL,
    ADD COLUMN `factorDesgaste` DOUBLE NOT NULL DEFAULT 0.15,
    ADD COLUMN `googlePlaceId` VARCHAR(191) NULL,
    ADD COLUMN `icono` VARCHAR(191) NOT NULL DEFAULT '🌳',
    ADD COLUMN `isLocationVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `limiteSemanasEstabilidad` INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN `locationPrivacy` ENUM('EXACTA', 'SECTOR', 'OCULTA') NOT NULL DEFAULT 'SECTOR',
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `modoCrisis` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `modoGobierno` VARCHAR(191) NOT NULL DEFAULT 'DEMOCRATICO',
    ADD COLUMN `presupuestoTotal` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `sector` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TreeMember` ADD COLUMN `avalBanHasta` DATETIME(3) NULL,
    ADD COLUMN `bonoMentoriaActivo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `bonoMentoriaExpira` DATETIME(3) NULL,
    ADD COLUMN `goldenTickets` TEXT NOT NULL,
    ADD COLUMN `lastBerriesUpdate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `lastCycleKey` VARCHAR(191) NULL,
    ADD COLUMN `strikesEconomicos` TEXT NOT NULL,
    MODIFY `status` ENUM('UNVERIFIED', 'VERIFIED', 'BANNED') NOT NULL DEFAULT 'UNVERIFIED',
    MODIFY `skills` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `is_guest` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_onboarded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `profilePic` VARCHAR(191) NULL,
    ADD COLUMN `publicProfileEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `publicShowLevels` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `publicShowTaskHistory` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `publicShowTreeSize` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `seekingWork` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `visibleForRecruitment` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `email` VARCHAR(191) NULL,
    MODIFY `password` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AutosustentoIdea` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('PROPOSED', 'GATHERING_SUPPORT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CONVERTED_TO_BRANCH', 'ARCHIVED') NOT NULL DEFAULT 'PROPOSED',
    `productOrService` VARCHAR(191) NULL,
    `targetClient` TEXT NULL,
    `valueProposition` TEXT NULL,
    `requiredResources` TEXT NULL,
    `estimatedStartupCostFiat` DOUBLE NULL,
    `expectedMonthlyIncomeFiat` DOUBLE NULL,
    `expectedMonthlyCostFiat` DOUBLE NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'CLP',
    `legalRisks` TEXT NULL,
    `operationalRisks` TEXT NULL,
    `socialRisks` TEXT NULL,
    `viabilitySummary` TEXT NULL,
    `closureCriteria` TEXT NULL,
    `reviewPeriodDays` INTEGER NULL DEFAULT 90,
    `convertedBranchId` VARCHAR(191) NULL,
    `convertedAt` DATETIME(3) NULL,
    `convertedById` VARCHAR(191) NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AutosustentoIdea_treeId_idx`(`treeId`),
    INDEX `AutosustentoIdea_createdById_idx`(`createdById`),
    INDEX `AutosustentoIdea_status_idx`(`status`),
    INDEX `AutosustentoIdea_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutosustentoIdeaSupport` (
    `id` VARCHAR(191) NOT NULL,
    `ideaId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `supportType` ENUM('LIKE', 'WOULD_PARTICIPATE', 'KNOWS_CLIENTS_OR_WOULD_BUY') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AutosustentoIdeaSupport_ideaId_idx`(`ideaId`),
    INDEX `AutosustentoIdeaSupport_userId_idx`(`userId`),
    INDEX `AutosustentoIdeaSupport_supportType_idx`(`supportType`),
    UNIQUE INDEX `AutosustentoIdeaSupport_ideaId_userId_supportType_key`(`ideaId`, `userId`, `supportType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SustainabilityCycle` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CLP',
    `totalIncomeFiat` DOUBLE NOT NULL DEFAULT 0,
    `totalExpenseFiat` DOUBLE NOT NULL DEFAULT 0,
    `totalInvestmentFiat` DOUBLE NOT NULL DEFAULT 0,
    `netFiat` DOUBLE NOT NULL DEFAULT 0,
    `surplusFiat` DOUBLE NOT NULL DEFAULT 0,
    `deficitFiat` DOUBLE NOT NULL DEFAULT 0,
    `marginPct` DOUBLE NOT NULL DEFAULT 0,
    `materialsFiat` DOUBLE NOT NULL DEFAULT 0,
    `laborFiat` DOUBLE NOT NULL DEFAULT 0,
    `operationsFiat` DOUBLE NOT NULL DEFAULT 0,
    `taxFiat` DOUBLE NOT NULL DEFAULT 0,
    `reserveFiat` DOUBLE NOT NULL DEFAULT 0,
    `maintenanceFiat` DOUBLE NOT NULL DEFAULT 0,
    `reinvestmentFiat` DOUBLE NOT NULL DEFAULT 0,
    `otherFiat` DOUBLE NOT NULL DEFAULT 0,
    `treeFundFiat` DOUBLE NOT NULL DEFAULT 0,
    `transactionsCount` INTEGER NOT NULL DEFAULT 0,
    `verifiedAmountFiat` DOUBLE NOT NULL DEFAULT 0,
    `includeOnlyVerified` BOOLEAN NOT NULL DEFAULT false,
    `multiCurrencyWarning` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'CALCULATED', 'REVIEWED', 'APPROVED', 'LOCKED') NOT NULL DEFAULT 'DRAFT',
    `calculatedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedById` VARCHAR(191) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedById` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SustainabilityCycle_treeId_idx`(`treeId`),
    INDEX `SustainabilityCycle_branchId_idx`(`branchId`),
    INDEX `SustainabilityCycle_status_idx`(`status`),
    INDEX `SustainabilityCycle_periodStart_periodEnd_idx`(`periodStart`, `periodEnd`),
    INDEX `SustainabilityCycle_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SustainabilityAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `cycleId` VARCHAR(191) NOT NULL,
    `type` ENUM('RESERVE', 'MAINTENANCE', 'TREE_FUND', 'REINVESTMENT', 'OTHER') NOT NULL,
    `amountFiat` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CLP',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SustainabilityAllocation_cycleId_idx`(`cycleId`),
    INDEX `SustainabilityAllocation_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BerryConfig` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `berriesEnabled` BOOLEAN NOT NULL DEFAULT false,
    `monthlyFlowRate` DOUBLE NOT NULL DEFAULT 0.10,
    `monthlyFlowDay` INTEGER NOT NULL DEFAULT 1,
    `allowP2PTransfers` BOOLEAN NOT NULL DEFAULT false,
    `allowTaskRewards` BOOLEAN NOT NULL DEFAULT true,
    `allowAuditRewards` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BerryConfig_treeId_key`(`treeId`),
    INDEX `BerryConfig_treeId_idx`(`treeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BerryTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `fromUserId` VARCHAR(191) NULL,
    `toUserId` VARCHAR(191) NULL,
    `type` ENUM('TASK_REWARD', 'AUDIT_REWARD', 'LEVEL_REWARD', 'P2P_TRANSFER_IN', 'P2P_TRANSFER_OUT', 'MONTHLY_FLOW_LOSS', 'ADJUSTMENT', 'REVERSAL') NOT NULL,
    `amount` DOUBLE NOT NULL,
    `balanceBefore` DOUBLE NULL,
    `balanceAfter` DOUBLE NULL,
    `cycleKey` VARCHAR(191) NULL,
    `sourceType` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BerryTransaction_treeId_idx`(`treeId`),
    INDEX `BerryTransaction_userId_idx`(`userId`),
    INDEX `BerryTransaction_type_idx`(`type`),
    INDEX `BerryTransaction_cycleKey_idx`(`cycleKey`),
    INDEX `BerryTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BerryMonthlyCycle` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `cycleKey` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `status` ENUM('RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `usersProcessed` INTEGER NOT NULL DEFAULT 0,
    `totalDestroyed` DOUBLE NOT NULL DEFAULT 0,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BerryMonthlyCycle_treeId_idx`(`treeId`),
    INDEX `BerryMonthlyCycle_cycleKey_idx`(`cycleKey`),
    INDEX `BerryMonthlyCycle_status_idx`(`status`),
    UNIQUE INDEX `BerryMonthlyCycle_treeId_cycleKey_key`(`treeId`, `cycleKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsightSignal` (
    `id` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('INTERNAL_NEED', 'EXTERNAL_NEED', 'BRANCH', 'SOLUTION_PROPOSAL', 'TASK_PATTERN', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
    `sourceNeedId` VARCHAR(191) NULL,
    `sourceExternalNeedId` VARCHAR(191) NULL,
    `sourceBranchId` VARCHAR(191) NULL,
    `sourceSolutionId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'INTERNAL_SEARCH', 'INTERNAL_SOLUTION_FOUND', 'EXTERNAL_PEOPLE_OPEN', 'EXTERNAL_PEOPLE_IN_REVIEW', 'EXTERNAL_PEOPLE_FAILED', 'CORPORATE_REFERRAL_OPEN', 'CORPORATE_REFERRAL_SELECTED', 'RESOLVED', 'CANCELLED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `escalationLevel` ENUM('INTERNAL_TRUST', 'EXTERNAL_PEOPLE', 'EXTERNAL_COMPANY') NOT NULL DEFAULT 'INTERNAL_TRUST',
    `visibility` ENUM('PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC_METADATA', 'PUBLIC_OPENING') NOT NULL DEFAULT 'TREE_ONLY',
    `persistenceScore` DOUBLE NULL,
    `capacityGapScore` DOUBLE NULL,
    `urgencyScore` DOUBLE NULL,
    `strategicValueScore` DOUBLE NULL,
    `requiredSkillTags` JSON NULL,
    `requiredResources` TEXT NULL,
    `locationText` VARCHAR(191) NULL,
    `remoteAllowed` BOOLEAN NOT NULL DEFAULT true,
    `budgetFiatMin` DOUBLE NULL,
    `budgetFiatExpected` DOUBLE NULL,
    `budgetFiatMax` DOUBLE NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'CLP',
    `estimatedBerries` INTEGER NULL,
    `internalSearchStartedAt` DATETIME(3) NULL,
    `internalSearchEndedAt` DATETIME(3) NULL,
    `externalPeopleOpenedAt` DATETIME(3) NULL,
    `externalPeopleClosedAt` DATETIME(3) NULL,
    `corporateOpenedAt` DATETIME(3) NULL,
    `corporateClosedAt` DATETIME(3) NULL,
    `resolutionNotes` TEXT NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InsightSignal_treeId_idx`(`treeId`),
    INDEX `InsightSignal_status_idx`(`status`),
    INDEX `InsightSignal_escalationLevel_idx`(`escalationLevel`),
    INDEX `InsightSignal_sourceType_idx`(`sourceType`),
    INDEX `InsightSignal_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsightInternalMatch` (
    `id` VARCHAR(191) NOT NULL,
    `insightSignalId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `branchId` VARCHAR(191) NULL,
    `treeId` VARCHAR(191) NULL,
    `matchType` ENUM('USER', 'BRANCH', 'TREE', 'AUTOSUSTENTO_BRANCH', 'PREVIOUS_TASK', 'SOLUTION') NOT NULL,
    `matchScore` DOUBLE NULL,
    `skillTags` JSON NULL,
    `evidenceSummary` TEXT NULL,
    `availabilityNote` TEXT NULL,
    `status` ENUM('SUGGESTED', 'CONTACTED', 'ACCEPTED', 'DECLINED', 'INSUFFICIENT_CAPACITY', 'SELECTED') NOT NULL DEFAULT 'SUGGESTED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InsightInternalMatch_insightSignalId_idx`(`insightSignalId`),
    INDEX `InsightInternalMatch_userId_idx`(`userId`),
    INDEX `InsightInternalMatch_branchId_idx`(`branchId`),
    INDEX `InsightInternalMatch_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsightExternalOpening` (
    `id` VARCHAR(191) NOT NULL,
    `insightSignalId` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'INTERNAL_REVIEW', 'OPEN', 'PAUSED', 'CLOSED', 'ENOUGH_CANDIDATES', 'NOT_ENOUGH_CANDIDATES', 'CANCELLED', 'CONVERTED_TO_VALIDATION', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `requiredSkillTags` JSON NULL,
    `adjacentSkillTags` JSON NULL,
    `desiredExperience` TEXT NULL,
    `desiredEvidence` TEXT NULL,
    `practicalTestNote` TEXT NULL,
    `workMode` ENUM('REMOTE_ONLY', 'ON_SITE_ONLY', 'HYBRID', 'REMOTE_ALLOWED') NOT NULL DEFAULT 'REMOTE_ALLOWED',
    `remoteAllowed` BOOLEAN NOT NULL DEFAULT true,
    `locationText` VARCHAR(191) NULL,
    `paymentMode` ENUM('FIAT', 'BERRIES', 'MIXED', 'UNPAID_VOLUNTEER') NOT NULL DEFAULT 'FIAT',
    `paymentFiatMin` DOUBLE NULL,
    `paymentFiatExpected` DOUBLE NULL,
    `paymentFiatMax` DOUBLE NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'CLP',
    `paymentBerries` INTEGER NULL,
    `paymentBerriesMin` INTEGER NULL,
    `paymentBerriesExpected` INTEGER NULL,
    `paymentBerriesMax` INTEGER NULL,
    `estimatedDurationDays` INTEGER NULL,
    `estimatedHours` INTEGER NULL,
    `urgencyLevel` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `riskLevel` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `applicationDeadline` DATETIME(3) NULL,
    `maxCandidates` INTEGER NULL,
    `minCandidatesNeeded` INTEGER NULL DEFAULT 1,
    `publicVisibility` ENUM('PRIVATE', 'TREE_ONLY', 'TRUST_NETWORK', 'PUBLIC_METADATA', 'PUBLIC_APPLICATION') NOT NULL DEFAULT 'TRUST_NETWORK',
    `externalShareToken` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InsightExternalOpening_externalShareToken_key`(`externalShareToken`),
    INDEX `InsightExternalOpening_insightSignalId_idx`(`insightSignalId`),
    INDEX `InsightExternalOpening_treeId_idx`(`treeId`),
    INDEX `InsightExternalOpening_status_idx`(`status`),
    INDEX `InsightExternalOpening_createdById_idx`(`createdById`),
    INDEX `InsightExternalOpening_openedAt_idx`(`openedAt`),
    INDEX `InsightExternalOpening_applicationDeadline_idx`(`applicationDeadline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsightExternalApplication` (
    `id` VARCHAR(191) NOT NULL,
    `openingId` VARCHAR(191) NOT NULL,
    `insightSignalId` VARCHAR(191) NULL,
    `treeId` VARCHAR(191) NULL,
    `applicantName` VARCHAR(191) NOT NULL,
    `applicantEmail` VARCHAR(191) NULL,
    `applicantPhone` VARCHAR(191) NULL,
    `applicantLocation` VARCHAR(191) NULL,
    `applicantSummary` TEXT NULL,
    `motivation` TEXT NULL,
    `experienceSummary` TEXT NULL,
    `portfolioUrl` VARCHAR(191) NULL,
    `externalProfileUrl` VARCHAR(191) NULL,
    `evidenceNote` TEXT NULL,
    `skillTags` JSON NULL,
    `requestedFiat` DOUBLE NULL,
    `requestedBerries` INTEGER NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'CLP',
    `availabilityNote` VARCHAR(191) NULL,
    `earliestStartDate` DATETIME(3) NULL,
    `status` ENUM('RECEIVED', 'BASIC_REVIEW', 'MORE_INFO_REQUESTED', 'INVITED_TO_VALIDATION', 'REJECTED', 'WITHDRAWN', 'ACCEPTED_FOR_NEXT_STEP', 'CONVERTED_TO_USER', 'ARCHIVED') NOT NULL DEFAULT 'RECEIVED',
    `privacyConsent` BOOLEAN NOT NULL DEFAULT false,
    `termsAccepted` BOOLEAN NOT NULL DEFAULT false,
    `linkedUserId` VARCHAR(191) NULL,
    `evidenceFileId` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNotes` TEXT NULL,
    `invitedToValidationAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InsightExternalApplication_openingId_idx`(`openingId`),
    INDEX `InsightExternalApplication_insightSignalId_idx`(`insightSignalId`),
    INDEX `InsightExternalApplication_treeId_idx`(`treeId`),
    INDEX `InsightExternalApplication_status_idx`(`status`),
    INDEX `InsightExternalApplication_linkedUserId_idx`(`linkedUserId`),
    INDEX `InsightExternalApplication_applicantEmail_idx`(`applicantEmail`),
    INDEX `InsightExternalApplication_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsightCorporateReferral` (
    `id` VARCHAR(191) NOT NULL,
    `insightSignalId` VARCHAR(191) NOT NULL,
    `providerName` VARCHAR(191) NOT NULL,
    `providerContact` VARCHAR(191) NULL,
    `providerWebsite` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'OPEN', 'CONTACTED', 'PROPOSAL_RECEIVED', 'SELECTED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `reasonForEscalation` TEXT NULL,
    `expectedScope` TEXT NULL,
    `estimatedFiatMin` DOUBLE NULL,
    `estimatedFiatMax` DOUBLE NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'CLP',
    `selectedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `metadataJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InsightCorporateReferral_insightSignalId_idx`(`insightSignalId`),
    INDEX `InsightCorporateReferral_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `FiatTransaction_createdById_idx` ON `FiatTransaction`(`createdById`);

-- CreateIndex
CREATE INDEX `FiatTransaction_certifiedById_idx` ON `FiatTransaction`(`certifiedById`);

-- CreateIndex
CREATE INDEX `FiatTransaction_solutionProposalId_idx` ON `FiatTransaction`(`solutionProposalId`);

-- CreateIndex
CREATE INDEX `FiatTransaction_counterpartyType_idx` ON `FiatTransaction`(`counterpartyType`);

-- CreateIndex
CREATE INDEX `Tree_country_city_sector_idx` ON `Tree`(`country`, `city`, `sector`);

-- AddForeignKey
ALTER TABLE `ConnectionToken` ADD CONSTRAINT `ConnectionToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SatisfaccionEvaluador` ADD CONSTRAINT `SatisfaccionEvaluador_deliverableId_fkey` FOREIGN KEY (`deliverableId`) REFERENCES `PhaseDeliverable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlantillaArbol` ADD CONSTRAINT `PlantillaArbol_creadorId_fkey` FOREIGN KEY (`creadorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_certifiedById_fkey` FOREIGN KEY (`certifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_receiptEvidenceId_fkey` FOREIGN KEY (`receiptEvidenceId`) REFERENCES `EvidenceFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TokenInvitacion` ADD CONSTRAINT `TokenInvitacion_arbolId_fkey` FOREIGN KEY (`arbolId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Auditoria` ADD CONSTRAINT `Auditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TreeRelation` ADD CONSTRAINT `TreeRelation_sourceTreeId_fkey` FOREIGN KEY (`sourceTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PromiseP2P` ADD CONSTRAINT `PromiseP2P_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertaZonal` ADD CONSTRAINT `AlertaZonal_emisorId_fkey` FOREIGN KEY (`emisorId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BonusPool` ADD CONSTRAINT `BonusPool_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BonusVote` ADD CONSTRAINT `BonusVote_bonusPoolId_fkey` FOREIGN KEY (`bonusPoolId`) REFERENCES `BonusPool`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillMigration` ADD CONSTRAINT `SkillMigration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrustTreaty` ADD CONSTRAINT `TrustTreaty_sourceTreeId_fkey` FOREIGN KEY (`sourceTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillProposal` ADD CONSTRAINT `SkillProposal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillEndorsement` ADD CONSTRAINT `SkillEndorsement_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `SkillProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SearchPass` ADD CONSTRAINT `SearchPass_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterviewInvitation` ADD CONSTRAINT `InterviewInvitation_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutosustentoIdea` ADD CONSTRAINT `AutosustentoIdea_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutosustentoIdea` ADD CONSTRAINT `AutosustentoIdea_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutosustentoIdeaSupport` ADD CONSTRAINT `AutosustentoIdeaSupport_ideaId_fkey` FOREIGN KEY (`ideaId`) REFERENCES `AutosustentoIdea`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutosustentoIdeaSupport` ADD CONSTRAINT `AutosustentoIdeaSupport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SustainabilityCycle` ADD CONSTRAINT `SustainabilityCycle_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SustainabilityCycle` ADD CONSTRAINT `SustainabilityCycle_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SustainabilityAllocation` ADD CONSTRAINT `SustainabilityAllocation_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `SustainabilityCycle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BerryConfig` ADD CONSTRAINT `BerryConfig_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BerryTransaction` ADD CONSTRAINT `BerryTransaction_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BerryTransaction` ADD CONSTRAINT `BerryTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BerryMonthlyCycle` ADD CONSTRAINT `BerryMonthlyCycle_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightSignal` ADD CONSTRAINT `InsightSignal_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightSignal` ADD CONSTRAINT `InsightSignal_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightInternalMatch` ADD CONSTRAINT `InsightInternalMatch_insightSignalId_fkey` FOREIGN KEY (`insightSignalId`) REFERENCES `InsightSignal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightInternalMatch` ADD CONSTRAINT `InsightInternalMatch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightExternalOpening` ADD CONSTRAINT `InsightExternalOpening_insightSignalId_fkey` FOREIGN KEY (`insightSignalId`) REFERENCES `InsightSignal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightExternalOpening` ADD CONSTRAINT `InsightExternalOpening_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightExternalOpening` ADD CONSTRAINT `InsightExternalOpening_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightExternalApplication` ADD CONSTRAINT `InsightExternalApplication_openingId_fkey` FOREIGN KEY (`openingId`) REFERENCES `InsightExternalOpening`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightExternalApplication` ADD CONSTRAINT `InsightExternalApplication_linkedUserId_fkey` FOREIGN KEY (`linkedUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightExternalApplication` ADD CONSTRAINT `InsightExternalApplication_evidenceFileId_fkey` FOREIGN KEY (`evidenceFileId`) REFERENCES `EvidenceFile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InsightCorporateReferral` ADD CONSTRAINT `InsightCorporateReferral_insightSignalId_fkey` FOREIGN KEY (`insightSignalId`) REFERENCES `InsightSignal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `SkillMigration` RENAME INDEX `SkillMigration_userId_hashtag_src_tgt_key` TO `SkillMigration_userId_hashtag_sourceTreeId_targetTreeId_key`;

-- RenameIndex
ALTER TABLE `TreeRelation` RENAME INDEX `TreeRelation_src_tgt_type_key` TO `TreeRelation_sourceTreeId_targetTreeId_relationType_key`;

-- RenameIndex
ALTER TABLE `TrustTreaty` RENAME INDEX `TrustTreaty_src_tgt_hashtag_key` TO `TrustTreaty_sourceTreeId_targetTreeId_hashtag_key`;

