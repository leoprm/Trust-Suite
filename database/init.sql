-- ═══════════════════════════════════════════════════════════════════════════════
-- Trust Lite — Master Database Schema (MySQL 8.x)
-- Generated from Prisma schema.prisma (consolidated)
--
-- This file is the SINGLE SOURCE OF TRUTH for database structure.
-- The backend reads and executes this file on startup to ensure all tables exist.
-- For Docker: mount this file as an init script for the MySQL container.
--
-- IMPORTANT: Use CREATE TABLE IF NOT EXISTS so it's safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USERS & AUTH
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `User` (
    `id`                      VARCHAR(191) NOT NULL,
    `username`                VARCHAR(191) NOT NULL,
    `email`                   VARCHAR(191) NULL,
    `password`                VARCHAR(191) NULL,
    `is_guest`                BOOLEAN NOT NULL DEFAULT false,
    `is_onboarded`            BOOLEAN NOT NULL DEFAULT false,
    `role`                    ENUM('PERSON','ADMINISTRATOR') NOT NULL DEFAULT 'PERSON',
    `createdAt`               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`               DATETIME(3) NOT NULL,
    `sharingCode`             VARCHAR(191) NOT NULL,
    `profilePic`              VARCHAR(191) NULL,
    `publicProfileEnabled`    BOOLEAN NOT NULL DEFAULT false,
    `publicShowLevels`        BOOLEAN NOT NULL DEFAULT true,
    `publicShowTreeSize`      BOOLEAN NOT NULL DEFAULT true,
    `publicShowTaskHistory`   BOOLEAN NOT NULL DEFAULT true,
    `visibleForRecruitment`   BOOLEAN NOT NULL DEFAULT false,
    `seekingWork`             BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_sharingCode_key`(`sharingCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `UserContact` (
    `id`        VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserContact_userId_contactId_key`(`userId`, `contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ConnectionToken` (
    `id`        VARCHAR(191) NOT NULL,
    `token`     VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedById`  VARCHAR(191) NULL,
    `usedAt`    DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ConnectionToken_token_key`(`token`),
    INDEX `ConnectionToken_token_idx`(`token`),
    INDEX `ConnectionToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PrivacySettings` (
    `id`                         VARCHAR(191) NOT NULL,
    `userId`                     VARCHAR(191) NOT NULL,
    `traceProfileVisibility`     ENUM('PRIVATE','TREE_ONLY','TRUST_NETWORK','PUBLIC') NOT NULL DEFAULT 'TREE_ONLY',
    `taskHistoryVisibility`      ENUM('PRIVATE','TREE_ONLY','TRUST_NETWORK','PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `evidenceVisibility`         ENUM('PRIVATE','TREE_ONLY','TRUST_NETWORK','PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `showInTalentSearch`         BOOLEAN NOT NULL DEFAULT false,
    `allowAggregatedMetrics`     BOOLEAN NOT NULL DEFAULT true,
    `createdAt`                  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`                  DATETIME(3) NOT NULL,

    UNIQUE INDEX `PrivacySettings_userId_key`(`userId`),
    INDEX `PrivacySettings_traceProfileVisibility_idx`(`traceProfileVisibility`),
    INDEX `PrivacySettings_showInTalentSearch_idx`(`showInTalentSearch`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EventLog` (
    `id`           VARCHAR(191) NOT NULL,
    `treeId`       VARCHAR(191) NULL,
    `actorId`      VARCHAR(191) NULL,
    `action`       VARCHAR(191) NOT NULL,
    `entityType`   VARCHAR(191) NOT NULL,
    `entityId`     VARCHAR(191) NULL,
    `beforeJson`   JSON NULL,
    `afterJson`    JSON NULL,
    `metadataJson` JSON NULL,
    `ipAddress`    VARCHAR(191) NULL,
    `userAgent`    TEXT NULL,
    `severity`     ENUM('INFO','WARNING','CRITICAL') NOT NULL DEFAULT 'INFO',
    `source`       ENUM('USER','SYSTEM','ADMIN','AUTOMATION') NOT NULL DEFAULT 'USER',
    `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventLog_treeId_idx`(`treeId`),
    INDEX `EventLog_actorId_idx`(`actorId`),
    INDEX `EventLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `EventLog_action_idx`(`action`),
    INDEX `EventLog_createdAt_idx`(`createdAt`),
    INDEX `EventLog_severity_idx`(`severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EvidenceFile` (
    `id`             VARCHAR(191) NOT NULL,
    `uploaderId`     VARCHAR(191) NOT NULL,
    `treeId`         VARCHAR(191) NULL,
    `taskId`         VARCHAR(191) NULL,
    `auditId`        VARCHAR(191) NULL,
    `originalName`   VARCHAR(191) NOT NULL,
    `storedName`     VARCHAR(191) NOT NULL,
    `storagePath`    TEXT NOT NULL,
    `mimeType`       VARCHAR(191) NOT NULL,
    `extension`      VARCHAR(191) NOT NULL,
    `sizeBytes`      INTEGER NOT NULL,
    `visibility`     ENUM('PRIVATE','TASK_PARTICIPANTS','TREE_ONLY','TRUST_NETWORK','PUBLIC_METADATA','PUBLIC') NOT NULL DEFAULT 'TASK_PARTICIPANTS',
    `status`         ENUM('ACTIVE','DELETED','QUARANTINED') NOT NULL DEFAULT 'ACTIVE',
    `checksumSha256` VARCHAR(191) NULL,
    `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3) NOT NULL,

    INDEX `EvidenceFile_uploaderId_idx`(`uploaderId`),
    INDEX `EvidenceFile_treeId_idx`(`treeId`),
    INDEX `EvidenceFile_taskId_idx`(`taskId`),
    INDEX `EvidenceFile_visibility_idx`(`visibility`),
    INDEX `EvidenceFile_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TREES (Árboles)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `Tree` (
    `id`                       VARCHAR(191) NOT NULL,
    `name`                     VARCHAR(191) NOT NULL,
    `icono`                    VARCHAR(191) NOT NULL DEFAULT '🌳',
    `description`              TEXT NULL,
    `inviteCode`               VARCHAR(191) NOT NULL,
    `creatorId`                VARCHAR(191) NULL,
    `createdAt`                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `capacidades`              TEXT NOT NULL,
    `country`                  VARCHAR(191) NULL,
    `city`                     VARCHAR(191) NULL,
    `sector`                   VARCHAR(191) NULL,
    `latitude`                 DOUBLE NULL,
    `longitude`                DOUBLE NULL,
    `direccionExacta`          VARCHAR(191) NULL,
    `locationPrivacy`          ENUM('EXACTA','SECTOR','OCULTA') NOT NULL DEFAULT 'SECTOR',
    `fachadaUrl`               TEXT NULL,
    `googlePlaceId`            VARCHAR(191) NULL,
    `isLocationVerified`       BOOLEAN NOT NULL DEFAULT false,
    `settings`                 TEXT NULL,
    `visibility`               ENUM('PRIVATE','PUBLIC') NOT NULL DEFAULT 'PRIVATE',
    `admissionPolicy`          ENUM('OPEN','INVITE_ONLY') NOT NULL DEFAULT 'INVITE_ONLY',
    `allowHashtags`            BOOLEAN NOT NULL DEFAULT true,
    `allowTraditionalBranches` BOOLEAN NOT NULL DEFAULT true,
    `hashtagCreationPolicy`    ENUM('ADMIN_ONLY','USERS_ONLY','ADMIN_AND_USERS') NOT NULL DEFAULT 'ADMIN_AND_USERS',
    `modoCrisis`               BOOLEAN NOT NULL DEFAULT false,
    `crisisSubjects`           TEXT NOT NULL,
    `crisisExpiresAt`          DATETIME(3) NULL,
    `economyMode`              ENUM('NO_ECONOMY','LEGACY_FIAT','BERRIES_LATENT','BERRIES_ACTIVE','TRUST_FULL') NOT NULL DEFAULT 'NO_ECONOMY',
    `presupuestoTotal`         DOUBLE NOT NULL DEFAULT 100,
    `limiteSemanasEstabilidad` INT NOT NULL DEFAULT 24,
    `factorDesgaste`           DOUBLE NOT NULL DEFAULT 0.15,
    `modoGobierno`             VARCHAR(191) NOT NULL DEFAULT 'DEMOCRATICO',
    `creacionRamaDirecta`      BOOLEAN NOT NULL DEFAULT false,
    `creacionRamaComunitaria`  BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Tree_inviteCode_key`(`inviteCode`),
    INDEX `Tree_country_city_sector_idx`(`country`, `city`, `sector`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TreeMember` (
    `id`                VARCHAR(191) NOT NULL,
    `userId`            VARCHAR(191) NOT NULL,
    `treeId`            VARCHAR(191) NOT NULL,
    `invitedById`       VARCHAR(191) NULL,
    `weeklyNeedPoints`  INT NOT NULL DEFAULT 100,
    `bayasBalance`      DOUBLE NOT NULL DEFAULT 0,
    `lastBerriesUpdate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `strikesEconomicos` TEXT NOT NULL,
    `status`            ENUM('UNVERIFIED','VERIFIED','BANNED') NOT NULL DEFAULT 'UNVERIFIED',
    `xp`                DOUBLE NOT NULL DEFAULT 0,
    `level`             INT NOT NULL DEFAULT 1,
    `skills`            TEXT NOT NULL,
    `goldenTickets`     TEXT NOT NULL,
    `role`              ENUM('ADMIN','MEMBER') NOT NULL DEFAULT 'MEMBER',
    `joinedAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `bonoMentoriaActivo` BOOLEAN NOT NULL DEFAULT false,
    `bonoMentoriaExpira` DATETIME(3) NULL,
    `avalBanHasta`       DATETIME(3) NULL,

    UNIQUE INDEX `TreeMember_userId_treeId_key`(`userId`, `treeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PlantillaArbol` (
    `id`            VARCHAR(191) NOT NULL,
    `nombre`        VARCHAR(191) NOT NULL,
    `descripcion`   VARCHAR(191) NULL,
    `icono`         VARCHAR(191) NULL,
    `esGlobal`      BOOLEAN NOT NULL DEFAULT false,
    `creadorId`     VARCHAR(191) NOT NULL,
    `configuracion` TEXT NOT NULL,
    `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`     DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TokenInvitacion` (
    `id`        VARCHAR(191) NOT NULL,
    `arbolId`   VARCHAR(191) NOT NULL,
    `creadorId` VARCHAR(191) NOT NULL,
    `usado`     BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TreeRelation` (
    `id`                     VARCHAR(191) NOT NULL,
    `sourceTreeId`           VARCHAR(191) NOT NULL,
    `targetTreeId`           VARCHAR(191) NOT NULL,
    `relationType`           VARCHAR(191) NOT NULL,
    `socialDistanceCategory` VARCHAR(191) NOT NULL,
    `createdAt`              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TreeRelation_src_tgt_type_key`(`sourceTreeId`, `targetTreeId`, `relationType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. NEEDS (Necesidades)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `Need` (
    `id`                  VARCHAR(191) NOT NULL,
    `creatorId`           VARCHAR(191) NOT NULL,
    `title`               VARCHAR(191) NOT NULL,
    `description`         TEXT NOT NULL,
    `totalPointsAssigned` INT NOT NULL DEFAULT 0,
    `failedAttempts`      INT NOT NULL DEFAULT 0,
    `createdAt`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status`              ENUM('ACTIVE','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'ACTIVE',
    `taskId`              VARCHAR(191) NULL,
    `proposesHashtag`     BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NeedTree` (
    `id`     VARCHAR(191) NOT NULL,
    `needId` VARCHAR(191) NOT NULL,
    `treeId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `NeedTree_needId_treeId_key`(`needId`, `treeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NeedFunding` (
    `id`        VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `needId`    VARCHAR(191) NOT NULL,
    `treeId`    VARCHAR(191) NULL,
    `points`    INT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. IDEAS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `Idea` (
    `id`                 VARCHAR(191) NOT NULL,
    `needId`             VARCHAR(191) NOT NULL,
    `creatorId`          VARCHAR(191) NOT NULL,
    `title`              VARCHAR(191) NOT NULL,
    `description`        TEXT NOT NULL,
    `likesCount`         INT NOT NULL DEFAULT 0,
    `createdAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `proposedPhasesJson` TEXT NULL,
    `requiredPeople`     INT NULL,
    `requiredSkills`     TEXT NULL,
    `estimatedMaterials` TEXT NULL,
    `estimatedFiatCost`  DOUBLE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `IdeaLike` (
    `id`        VARCHAR(191) NOT NULL,
    `ideaId`    VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `IdeaLike_ideaId_userId_key`(`ideaId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. BRANCHES (Ramas)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `Branch` (
    `id`                VARCHAR(191) NOT NULL,
    `ideaId`            VARCHAR(191) NULL,
    `treeId`            VARCHAR(191) NULL,
    `name`              VARCHAR(191) NULL,
    `type`              ENUM('NORMAL','HASHTAG','AUTOSUSTENTO','EXTERNAL_CONTRACT') NOT NULL DEFAULT 'NORMAL',
    `xpPool`            DOUBLE NOT NULL DEFAULT 0,
    `isDesire`          BOOLEAN NOT NULL DEFAULT false,
    `isHashtag`         BOOLEAN NOT NULL DEFAULT false,
    `bayasFund`         DOUBLE NOT NULL DEFAULT 0,
    `esVotable`         BOOLEAN NOT NULL DEFAULT true,
    `valorSugerido`     DOUBLE NULL,
    `valorOficial`      DOUBLE NOT NULL DEFAULT 0,
    `phase`             ENUM('INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION','MAINTENANCE','RECYCLING') NOT NULL DEFAULT 'INVESTIGATION',
    `activePhasesJson`  TEXT NULL,
    `currentPhaseIndex` INT NOT NULL DEFAULT 0,
    `expiresAt`         DATETIME(3) NULL,
    `createdAt`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId`            VARCHAR(191) NULL,

    UNIQUE INDEX `Branch_ideaId_key`(`ideaId`),
    INDEX `Branch_treeId_idx`(`treeId`),
    INDEX `Branch_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AutosustentoBranchConfig` (
    `id`                        VARCHAR(191) NOT NULL,
    `branchId`                  VARCHAR(191) NOT NULL,
    `treeId`                    VARCHAR(191) NOT NULL,
    `businessName`              VARCHAR(191) NULL,
    `productOrService`          VARCHAR(191) NOT NULL,
    `targetClient`              TEXT NULL,
    `valueProposition`          TEXT NULL,
    `status`                    ENUM('PROPOSED','UNDER_REVIEW','APPROVED','ACTIVE','PAUSED','REJECTED','CLOSED') NOT NULL DEFAULT 'PROPOSED',
    `viabilitySummary`          TEXT NULL,
    `requiredResources`         TEXT NULL,
    `legalRisks`                TEXT NULL,
    `operationalRisks`          TEXT NULL,
    `startupCostFiat`           DOUBLE NULL,
    `expectedMonthlyIncomeFiat` DOUBLE NULL,
    `expectedMonthlyCostFiat`   DOUBLE NULL,
    `currency`                  VARCHAR(191) NULL DEFAULT 'CLP',
    `reviewPeriodDays`          INT NULL DEFAULT 90,
    `nextReviewAt`              DATETIME(3) NULL,
    `closureCriteria`           TEXT NULL,
    `metadataJson`              JSON NULL,
    `createdById`               VARCHAR(191) NULL,
    `createdAt`                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AutosustentoBranchConfig_branchId_key`(`branchId`),
    INDEX `AutosustentoBranchConfig_treeId_idx`(`treeId`),
    INDEX `AutosustentoBranchConfig_status_idx`(`status`),
    INDEX `AutosustentoBranchConfig_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SustainabilitySplit` (
    `id`             VARCHAR(191) NOT NULL,
    `configId`       VARCHAR(191) NOT NULL,
    `materialsPct`   DOUBLE NOT NULL DEFAULT 0,
    `laborPct`       DOUBLE NOT NULL DEFAULT 0,
    `operationsPct`  DOUBLE NOT NULL DEFAULT 0,
    `taxPct`         DOUBLE NOT NULL DEFAULT 0,
    `reservePct`     DOUBLE NOT NULL DEFAULT 0,
    `maintenancePct` DOUBLE NOT NULL DEFAULT 0,
    `treeFundPct`    DOUBLE NOT NULL DEFAULT 0,
    `otherPct`       DOUBLE NOT NULL DEFAULT 0,
    `notes`          TEXT NULL,
    `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SustainabilitySplit_configId_key`(`configId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BranchMember` (
    `id`           VARCHAR(191) NOT NULL,
    `userId`       VARCHAR(191) NOT NULL,
    `branchId`     VARCHAR(191) NOT NULL,
    `joinedPhases` TEXT NOT NULL,
    `joinedAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BranchMember_userId_branchId_key`(`userId`, `branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BranchNeedVote` (
    `id`        VARCHAR(191) NOT NULL,
    `branchId`  VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `score`     INT NOT NULL DEFAULT 5,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BranchNeedVote_branchId_userId_key`(`branchId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TASKS (Tareas)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `ExternalNeed` (
    `id`             VARCHAR(191) NOT NULL,
    `treeId`         VARCHAR(191) NOT NULL,
    `createdById`    VARCHAR(191) NULL,
    `title`          VARCHAR(191) NOT NULL,
    `description`    TEXT NOT NULL,
    `status`         ENUM('DRAFT','OPEN','UNDER_REVIEW','SOLUTIONS_PROPOSED','APPROVED','REJECTED','CONVERTED_TO_TASKS','CANCELLED','COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `clientSummary`  TEXT NULL,
    `desiredOutcome` TEXT NULL,
    `constraints`    TEXT NULL,
    `deadline`       DATETIME(3) NULL,
    `budgetMinFiat`  DOUBLE NULL,
    `budgetMaxFiat`  DOUBLE NULL,
    `currency`       VARCHAR(191) NULL DEFAULT 'CLP',
    `visibility`     ENUM('PRIVATE','TREE_ONLY','TRUST_NETWORK','PUBLIC_METADATA','PUBLIC') NOT NULL DEFAULT 'TREE_ONLY',
    `metadataJson`   JSON NULL,
    `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExternalNeed_treeId_idx`(`treeId`),
    INDEX `ExternalNeed_status_idx`(`status`),
    INDEX `ExternalNeed_createdById_idx`(`createdById`),
    INDEX `ExternalNeed_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ExternalAgent` (
    `id`              VARCHAR(191) NOT NULL,
    `externalNeedId`  VARCHAR(191) NOT NULL,
    `name`            VARCHAR(191) NOT NULL,
    `email`           VARCHAR(191) NULL,
    `organization`    VARCHAR(191) NULL,
    `role`            ENUM('CLIENT','SPONSOR','CONTACT','APPROVER','OBSERVER') NOT NULL DEFAULT 'CLIENT',
    `notes`           TEXT NULL,
    `consentAccepted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExternalAgent_externalNeedId_idx`(`externalNeedId`),
    INDEX `ExternalAgent_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ScopePreference` (
    `id`               VARCHAR(191) NOT NULL,
    `externalNeedId`   VARCHAR(191) NOT NULL,
    `agentId`          VARCHAR(191) NULL,
    `label`            VARCHAR(191) NOT NULL,
    `labelKey`         VARCHAR(191) NOT NULL DEFAULT '',
    `score`            INT NOT NULL,
    `description`      TEXT NULL,
    `normalizedWeight` DOUBLE NULL,
    `createdById`      VARCHAR(191) NULL,
    `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ScopePreference_externalNeedId_idx`(`externalNeedId`),
    INDEX `ScopePreference_agentId_idx`(`agentId`),
    INDEX `ScopePreference_label_idx`(`label`),
    INDEX `ScopePreference_labelKey_idx`(`labelKey`),
    INDEX `ScopePreference_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SolutionProposal` (
    `id`                    VARCHAR(191) NOT NULL,
    `externalNeedId`        VARCHAR(191) NOT NULL,
    `createdById`           VARCHAR(191) NULL,
    `title`                 VARCHAR(191) NOT NULL,
    `description`           TEXT NOT NULL,
    `status`                ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED_BY_TREE','APPROVED_BY_CLIENT','REJECTED','SELECTED','ARCHIVED','CONVERTED_TO_TASKS') NOT NULL DEFAULT 'DRAFT',
    `estimatedFiatMin`      DOUBLE NULL,
    `estimatedFiatExpected` DOUBLE NULL,
    `estimatedFiatMax`      DOUBLE NULL,
    `currency`              VARCHAR(191) NULL DEFAULT 'CLP',
    `estimatedBerries`      INT NULL,
    `estimatedDurationDays` INT NULL,
    `riskLevel`             ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `assumptions`           TEXT NULL,
    `included`              TEXT NULL,
    `excluded`              TEXT NULL,
    `deliverables`          TEXT NULL,
    `acceptanceCriteria`    TEXT NULL,
    `maintenanceNotes`      TEXT NULL,
    `scopeAlignmentJson`    JSON NULL,
    `metadataJson`          JSON NULL,
    `selectedAt`            DATETIME(3) NULL,
    `selectedById`          VARCHAR(191) NULL,
    `approvedByClientAt`    DATETIME(3) NULL,
    `approvedByTreeAt`      DATETIME(3) NULL,
    `createdAt`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SolutionProposal_externalNeedId_idx`(`externalNeedId`),
    INDEX `SolutionProposal_createdById_idx`(`createdById`),
    INDEX `SolutionProposal_status_idx`(`status`),
    INDEX `SolutionProposal_riskLevel_idx`(`riskLevel`),
    INDEX `SolutionProposal_selectedById_idx`(`selectedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BudgetLine` (
    `id`                 VARCHAR(191) NOT NULL,
    `solutionProposalId` VARCHAR(191) NOT NULL,
    `label`              VARCHAR(191) NOT NULL,
    `description`        TEXT NULL,
    `type`               ENUM('LABOR','MATERIALS','INFRASTRUCTURE','TAXES','RESERVE','TREE_FUND','MAINTENANCE','EXTERNAL_SERVICE','OTHER') NOT NULL,
    `estimatedFiat`      DOUBLE NULL,
    `estimatedBerries`   INT NULL,
    `currency`           VARCHAR(191) NULL DEFAULT 'CLP',
    `quantity`           DOUBLE NULL,
    `unit`               VARCHAR(191) NULL,
    `unitCostFiat`       DOUBLE NULL,
    `createdAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BudgetLine_solutionProposalId_idx`(`solutionProposalId`),
    INDEX `BudgetLine_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Task` (
    `id`                 VARCHAR(191) NOT NULL,
    `branchId`           VARCHAR(191) NOT NULL,
    `name`               VARCHAR(191) NOT NULL DEFAULT 'Task',
    `description`        TEXT NOT NULL,
    `status`             ENUM('OPEN','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'OPEN',
    `assignedTo`         VARCHAR(191) NULL,
    `creatorId`          VARCHAR(191) NULL,
    `phase`              ENUM('INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION','MAINTENANCE','RECYCLING') NOT NULL DEFAULT 'INVESTIGATION',
    `evidenceUrl`        TEXT NULL,
    `evidenceStatus`     ENUM('PENDING','APPROVED','REJECTED') NULL,
    `completionComment`  TEXT NULL,
    `completedAt`        DATETIME(3) NULL,
    `completionPhotoUrl` TEXT NULL,
    `requiredHours`      DOUBLE NULL,
    `difficulty`         DOUBLE NULL,
    `isAnonymous`        BOOLEAN NOT NULL DEFAULT false,
    `requiresVoting`     BOOLEAN NOT NULL DEFAULT false,
    `auditada`           BOOLEAN NOT NULL DEFAULT false,
    `deadlineAt`         DATETIME(3) NULL,
    `createdAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TaskTag` (
    `id`        VARCHAR(191) NOT NULL,
    `taskId`    VARCHAR(191) NOT NULL,
    `skillName` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `TaskTag_taskId_skillName_key`(`taskId`, `skillName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TaskVote` (
    `id`               VARCHAR(191) NOT NULL,
    `taskId`           VARCHAR(191) NOT NULL,
    `userId`           VARCHAR(191) NOT NULL,
    `effortValue`      DOUBLE NULL,
    `requiredHours`    DOUBLE NULL,
    `difficulty`       DOUBLE NULL,
    `isRandomAssignee` BOOLEAN NOT NULL DEFAULT false,
    `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TaskVote_taskId_userId_key`(`taskId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TaskQuestion` (
    `id`        VARCHAR(191) NOT NULL,
    `taskId`    VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TaskQuestion_taskId_userId_key`(`taskId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DifficultyVote` (
    `id`        VARCHAR(191) NOT NULL,
    `taskId`    VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `value`     INT NOT NULL,
    `comment`   TEXT NULL,
    `status`    VARCHAR(191) NOT NULL DEFAULT 'valido',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DifficultyVote_userId_taskId_key`(`userId`, `taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DifficultyVoteLike` (
    `id`        VARCHAR(191) NOT NULL,
    `voteId`    VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DifficultyVoteLike_voteId_userId_key`(`voteId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Auditoria` (
    `id`            VARCHAR(191) NOT NULL,
    `usuarioId`     VARCHAR(191) NOT NULL,
    `taskId`        VARCHAR(191) NOT NULL,
    `notaSugerida`  INT NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Auditoria_usuarioId_idx`(`usuarioId`),
    INDEX `Auditoria_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. DELIVERABLES & SATISFACTION
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `PhaseDeliverable` (
    `id`               VARCHAR(191) NOT NULL,
    `branchId`         VARCHAR(191) NOT NULL,
    `phase`            ENUM('INVESTIGATION','DEVELOPMENT','PRODUCTION','DISTRIBUTION','MAINTENANCE','RECYCLING') NOT NULL,
    `deliverableUrl`   TEXT NOT NULL,
    `status`           ENUM('PENDING_REVIEW','COMPLETED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `initialXpAwarded` BOOLEAN NOT NULL DEFAULT false,
    `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SatisfaccionEvaluador` (
    `id`            VARCHAR(191) NOT NULL,
    `deliverableId` VARCHAR(191) NOT NULL,
    `userId`        VARCHAR(191) NOT NULL,
    `hasEvaluated`  BOOLEAN NOT NULL DEFAULT false,
    `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SatisfaccionEvaluador_deliverableId_userId_key`(`deliverableId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SatisfactionRating` (
    `id`            VARCHAR(191) NOT NULL,
    `deliverableId` VARCHAR(191) NOT NULL,
    `userId`        VARCHAR(191) NOT NULL,
    `rating`        DOUBLE NOT NULL,
    `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SatisfactionRating_deliverableId_userId_key`(`deliverableId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ECONOMIC ENGINE (FIAT, Assets, Promises)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `AssetFund` (
    `id`        VARCHAR(191) NOT NULL,
    `treeId`    VARCHAR(191) NOT NULL,
    `balance`   DOUBLE NOT NULL DEFAULT 0,
    `type`      ENUM('FIAT','PROPERTY') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `FiatTemplate` (
    `id`          VARCHAR(191) NOT NULL,
    `treeId`      VARCHAR(191) NOT NULL,
    `amount`      DOUBLE NULL,
    `type`        ENUM('INCOME','EXPENSE','INVESTMENT') NOT NULL,
    `category`    ENUM('WATER','ELECTRICITY','GAS','MORTGAGE','FUEL','SHOPPING','EQUIPMENT','MATERIAL','MONEY','OTHER') NOT NULL,
    `description` TEXT NULL,
    `isPeriodic`  BOOLEAN NOT NULL DEFAULT false,
    `periodicity` ENUM('BEGINNING_OF_YEAR','BEGINNING_OF_MONTH','BEGINNING_OF_WEEK','CUSTOM_DAYS') NULL,
    `daysCount`   INT NULL,
    `isFixed`     BOOLEAN NOT NULL DEFAULT false,
    `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt`  DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `FiatTransaction` (
    `id`                 VARCHAR(191) NOT NULL,
    `treeId`             VARCHAR(191) NOT NULL,
    `branchId`           VARCHAR(191) NULL,
    `taskId`             VARCHAR(191) NULL,
    `externalNeedId`     VARCHAR(191) NULL,
    `createdById`        VARCHAR(191) NULL,
    `templateId`         VARCHAR(191) NULL,
    `amount`             DOUBLE NOT NULL,
    `currency`           VARCHAR(191) NOT NULL DEFAULT 'CLP',
    `type`               ENUM('INCOME','EXPENSE','INVESTMENT') NOT NULL,
    `category`           ENUM('WATER','ELECTRICITY','GAS','MORTGAGE','FUEL','SHOPPING','EQUIPMENT','MATERIAL','MONEY','OTHER') NOT NULL,
    `description`        TEXT NULL,
    `verificationStatus` ENUM('DECLARED','BACKED_BY_RECEIPT','RECONCILED','AUDITED','API_VERIFIED') NOT NULL DEFAULT 'DECLARED',
    `receiptEvidenceId`  VARCHAR(191) NULL,
    `metadataJson`       JSON NULL,
    `date`               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`          DATETIME(3) NOT NULL,
    `isAutomatic`        BOOLEAN NOT NULL DEFAULT false,

    INDEX `FiatTransaction_treeId_idx`(`treeId`),
    INDEX `FiatTransaction_branchId_idx`(`branchId`),
    INDEX `FiatTransaction_taskId_idx`(`taskId`),
    INDEX `FiatTransaction_type_idx`(`type`),
    INDEX `FiatTransaction_verificationStatus_idx`(`verificationStatus`),
    INDEX `FiatTransaction_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PromiseP2P` (
    `id`                VARCHAR(191) NOT NULL,
    `taskId`            VARCHAR(191) NOT NULL,
    `sponsorId`         VARCHAR(191) NOT NULL,
    `amount`            DOUBLE NOT NULL,
    `currencyType`      ENUM('FIAT','BERRY') NOT NULL,
    `status`            ENUM('PENDING','PAYMENT_SENT','COMPLETED','DISPUTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    `comprobanteUrl`    TEXT NULL,
    `motivoCancelacion` TEXT NULL,
    `createdAt`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`         DATETIME(3) NOT NULL,

    INDEX `PromiseP2P_taskId_idx`(`taskId`),
    INDEX `PromiseP2P_sponsorId_idx`(`sponsorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. BONUS POOL (Bolsa de Valores Éticos)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `BonusPool` (
    `id`                     VARCHAR(191) NOT NULL,
    `treeId`                 VARCHAR(191) NOT NULL,
    `hashtag`                VARCHAR(191) NOT NULL,
    `puntosImportanciaTotal` DOUBLE NOT NULL DEFAULT 0,
    `porcentajeActual`       DOUBLE NOT NULL DEFAULT 0,
    `createdAt`              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`              DATETIME(3) NOT NULL,

    UNIQUE INDEX `BonusPool_treeId_hashtag_key`(`treeId`, `hashtag`),
    INDEX `BonusPool_treeId_idx`(`treeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BonusVote` (
    `id`          VARCHAR(191) NOT NULL,
    `bonusPoolId` VARCHAR(191) NOT NULL,
    `userId`      VARCHAR(191) NOT NULL,
    `score`       INT NOT NULL DEFAULT 5,
    `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3) NOT NULL,

    UNIQUE INDEX `BonusVote_bonusPoolId_userId_key`(`bonusPoolId`, `userId`),
    INDEX `BonusVote_bonusPoolId_idx`(`bonusPoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `Notification` (
    `id`           VARCHAR(191) NOT NULL,
    `userId`       VARCHAR(191) NOT NULL,
    `type`         ENUM('TASK_AUDIT','BUDGET_COMPLETE','LEVEL_UP','XP_GAIN','SKILL_UNLOCK','AVAL_RISK','TASK_ASSIGNED','TASK_COMPLETED','BRANCH_VOTE','GENERAL') NOT NULL DEFAULT 'GENERAL',
    `category`     ENUM('URGENTE','FLUJO','MERITO') NOT NULL DEFAULT 'FLUJO',
    `title`        VARCHAR(191) NOT NULL,
    `body`         TEXT NOT NULL,
    `entityType`   VARCHAR(191) NULL,
    `entityAction` VARCHAR(191) NULL,
    `entityId`     VARCHAR(191) NULL,
    `isRead`       BOOLEAN NOT NULL DEFAULT false,
    `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `Notification_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ALERTAS ZONALES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `AlertaZonal` (
    `id`             VARCHAR(191) NOT NULL,
    `emisorId`       VARCHAR(191) NOT NULL,
    `hashtag`        VARCHAR(191) NOT NULL,
    `gravedad`       INT NOT NULL DEFAULT 1,
    `scope`          ENUM('PAIS','CIUDAD','SECTOR') NOT NULL,
    `targetLocation` VARCHAR(191) NOT NULL,
    `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt`      DATETIME(3) NOT NULL,

    INDEX `AlertaZonal_scope_targetLocation_idx`(`scope`, `targetLocation`),
    INDEX `AlertaZonal_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. SKILL SYSTEM (XP, Proposals, Endorsements, Migration, Treaties)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `UserSkillXP` (
    `id`                VARCHAR(191) NOT NULL,
    `userId`            VARCHAR(191) NOT NULL,
    `skillTag`          VARCHAR(191) NOT NULL,
    `treeId`            VARCHAR(191) NOT NULL,
    `accumulatedPoints` INT NOT NULL DEFAULT 0,
    `completedTasks`    INT NOT NULL DEFAULT 0,
    `cachedPercentile`  INT NULL,
    `updatedAt`         DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserSkillXP_userId_skillTag_treeId_key`(`userId`, `skillTag`, `treeId`),
    INDEX `UserSkillXP_skillTag_treeId_accumulatedPoints_idx`(`skillTag`, `treeId`, `accumulatedPoints`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SkillProposal` (
    `id`             VARCHAR(191) NOT NULL,
    `userId`         VARCHAR(191) NOT NULL,
    `treeId`         VARCHAR(191) NOT NULL,
    `hashtag`        VARCHAR(191) NOT NULL,
    `status`         ENUM('PENDIENTE_AVALES','EN_PRUEBA','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE_AVALES',
    `tasksCompleted` INT NOT NULL DEFAULT 0,
    `tasksFailed`    INT NOT NULL DEFAULT 0,
    `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3) NOT NULL,

    UNIQUE INDEX `SkillProposal_userId_treeId_hashtag_key`(`userId`, `treeId`, `hashtag`),
    INDEX `SkillProposal_treeId_hashtag_status_idx`(`treeId`, `hashtag`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SkillEndorsement` (
    `id`         VARCHAR(191) NOT NULL,
    `proposalId` VARCHAR(191) NOT NULL,
    `endorserId` VARCHAR(191) NOT NULL,
    `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SkillEndorsement_proposalId_endorserId_key`(`proposalId`, `endorserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SkillMigration` (
    `id`             VARCHAR(191) NOT NULL,
    `userId`         VARCHAR(191) NOT NULL,
    `hashtag`        VARCHAR(191) NOT NULL,
    `sourceTreeId`   VARCHAR(191) NOT NULL,
    `targetTreeId`   VARCHAR(191) NOT NULL,
    `status`         ENUM('EN_PRUEBA','APROBADO','REPROBADO') NOT NULL DEFAULT 'EN_PRUEBA',
    `tasksCompleted` INT NOT NULL DEFAULT 0,
    `tasksFailed`    INT NOT NULL DEFAULT 0,
    `autoApproved`   BOOLEAN NOT NULL DEFAULT false,
    `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3) NOT NULL,

    UNIQUE INDEX `SkillMigration_userId_hashtag_src_tgt_key`(`userId`, `hashtag`, `sourceTreeId`, `targetTreeId`),
    INDEX `SkillMigration_targetTreeId_hashtag_idx`(`targetTreeId`, `hashtag`),
    INDEX `SkillMigration_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TrustTreaty` (
    `id`                    VARCHAR(191) NOT NULL,
    `sourceTreeId`          VARCHAR(191) NOT NULL,
    `targetTreeId`          VARCHAR(191) NOT NULL,
    `hashtag`               VARCHAR(191) NOT NULL,
    `exitosos`              INT NOT NULL DEFAULT 0,
    `totalIntentos`         INT NOT NULL DEFAULT 0,
    `activo`                BOOLEAN NOT NULL DEFAULT false,
    `revocadoPorCorrupcion` BOOLEAN NOT NULL DEFAULT false,
    `createdAt`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`             DATETIME(3) NOT NULL,

    UNIQUE INDEX `TrustTreaty_src_tgt_hashtag_key`(`sourceTreeId`, `targetTreeId`, `hashtag`),
    INDEX `TrustTreaty_targetTreeId_hashtag_activo_idx`(`targetTreeId`, `hashtag`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. RECRUITMENT (Search Passes & Interview Invitations)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `SearchPass` (
    `id`        VARCHAR(191) NOT NULL,
    `userId`    VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SearchPass_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `InterviewInvitation` (
    `id`          VARCHAR(191) NOT NULL,
    `senderId`    VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `message`     TEXT NOT NULL,
    `status`      ENUM('PENDING','ACCEPTED','REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,

    INDEX `InterviewInvitation_recipientId_status_idx`(`recipientId`, `status`),
    INDEX `InterviewInvitation_senderId_idx`(`senderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FOREIGN KEYS
-- Each statement is executed individually by the bootstrap function.
-- Duplicate FK errors are silently ignored (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════════

-- User contacts
ALTER TABLE `UserContact` ADD CONSTRAINT `UserContact_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserContact` ADD CONSTRAINT `UserContact_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ConnectionToken
ALTER TABLE `ConnectionToken` ADD CONSTRAINT `ConnectionToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- PrivacySettings
ALTER TABLE `PrivacySettings` ADD CONSTRAINT `PrivacySettings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- EventLog
ALTER TABLE `EventLog` ADD CONSTRAINT `EventLog_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EventLog` ADD CONSTRAINT `EventLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- EvidenceFile
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_uploaderId_fkey` FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- TreeMember
ALTER TABLE `TreeMember` ADD CONSTRAINT `TreeMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TreeMember` ADD CONSTRAINT `TreeMember_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TreeMember` ADD CONSTRAINT `TreeMember_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- PlantillaArbol
ALTER TABLE `PlantillaArbol` ADD CONSTRAINT `PlantillaArbol_creadorId_fkey` FOREIGN KEY (`creadorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- TokenInvitacion
ALTER TABLE `TokenInvitacion` ADD CONSTRAINT `TokenInvitacion_arbolId_fkey` FOREIGN KEY (`arbolId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TokenInvitacion` ADD CONSTRAINT `TokenInvitacion_creadorId_fkey` FOREIGN KEY (`creadorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- TreeRelation
ALTER TABLE `TreeRelation` ADD CONSTRAINT `TreeRelation_sourceTreeId_fkey` FOREIGN KEY (`sourceTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TreeRelation` ADD CONSTRAINT `TreeRelation_targetTreeId_fkey` FOREIGN KEY (`targetTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Need
ALTER TABLE `Need` ADD CONSTRAINT `Need_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Need` ADD CONSTRAINT `Need_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- NeedTree
ALTER TABLE `NeedTree` ADD CONSTRAINT `NeedTree_needId_fkey` FOREIGN KEY (`needId`) REFERENCES `Need`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NeedTree` ADD CONSTRAINT `NeedTree_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- NeedFunding
ALTER TABLE `NeedFunding` ADD CONSTRAINT `NeedFunding_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NeedFunding` ADD CONSTRAINT `NeedFunding_needId_fkey` FOREIGN KEY (`needId`) REFERENCES `Need`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Idea
ALTER TABLE `Idea` ADD CONSTRAINT `Idea_needId_fkey` FOREIGN KEY (`needId`) REFERENCES `Need`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Idea` ADD CONSTRAINT `Idea_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- IdeaLike
ALTER TABLE `IdeaLike` ADD CONSTRAINT `IdeaLike_ideaId_fkey` FOREIGN KEY (`ideaId`) REFERENCES `Idea`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `IdeaLike` ADD CONSTRAINT `IdeaLike_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Branch
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_ideaId_fkey` FOREIGN KEY (`ideaId`) REFERENCES `Idea`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AutosustentoBranchConfig
ALTER TABLE `AutosustentoBranchConfig` ADD CONSTRAINT `AutosustentoBranchConfig_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AutosustentoBranchConfig` ADD CONSTRAINT `AutosustentoBranchConfig_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AutosustentoBranchConfig` ADD CONSTRAINT `AutosustentoBranchConfig_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- SustainabilitySplit
ALTER TABLE `SustainabilitySplit` ADD CONSTRAINT `SustainabilitySplit_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `AutosustentoBranchConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- BranchMember
ALTER TABLE `BranchMember` ADD CONSTRAINT `BranchMember_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BranchMember` ADD CONSTRAINT `BranchMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- BranchNeedVote
ALTER TABLE `BranchNeedVote` ADD CONSTRAINT `BranchNeedVote_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BranchNeedVote` ADD CONSTRAINT `BranchNeedVote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Task
ALTER TABLE `Task` ADD CONSTRAINT `Task_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- TaskTag
ALTER TABLE `TaskTag` ADD CONSTRAINT `TaskTag_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- TaskVote
ALTER TABLE `TaskVote` ADD CONSTRAINT `TaskVote_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskVote` ADD CONSTRAINT `TaskVote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- TaskQuestion
ALTER TABLE `TaskQuestion` ADD CONSTRAINT `TaskQuestion_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskQuestion` ADD CONSTRAINT `TaskQuestion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- DifficultyVote
ALTER TABLE `DifficultyVote` ADD CONSTRAINT `DifficultyVote_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DifficultyVote` ADD CONSTRAINT `DifficultyVote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- DifficultyVoteLike
ALTER TABLE `DifficultyVoteLike` ADD CONSTRAINT `DifficultyVoteLike_voteId_fkey` FOREIGN KEY (`voteId`) REFERENCES `DifficultyVote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DifficultyVoteLike` ADD CONSTRAINT `DifficultyVoteLike_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Auditoria
ALTER TABLE `Auditoria` ADD CONSTRAINT `Auditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Auditoria` ADD CONSTRAINT `Auditoria_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AssetFund
ALTER TABLE `AssetFund` ADD CONSTRAINT `AssetFund_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- PhaseDeliverable
ALTER TABLE `PhaseDeliverable` ADD CONSTRAINT `PhaseDeliverable_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SatisfaccionEvaluador
ALTER TABLE `SatisfaccionEvaluador` ADD CONSTRAINT `SatisfaccionEvaluador_deliverableId_fkey` FOREIGN KEY (`deliverableId`) REFERENCES `PhaseDeliverable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SatisfaccionEvaluador` ADD CONSTRAINT `SatisfaccionEvaluador_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SatisfactionRating
ALTER TABLE `SatisfactionRating` ADD CONSTRAINT `SatisfactionRating_deliverableId_fkey` FOREIGN KEY (`deliverableId`) REFERENCES `PhaseDeliverable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SatisfactionRating` ADD CONSTRAINT `SatisfactionRating_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- FiatTemplate
ALTER TABLE `FiatTemplate` ADD CONSTRAINT `FiatTemplate_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- FiatTransaction
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `FiatTransaction` ADD CONSTRAINT `FiatTransaction_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `FiatTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ExternalNeed
ALTER TABLE `ExternalNeed` ADD CONSTRAINT `ExternalNeed_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ExternalNeed` ADD CONSTRAINT `ExternalNeed_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ExternalAgent
ALTER TABLE `ExternalAgent` ADD CONSTRAINT `ExternalAgent_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ScopePreference
ALTER TABLE `ScopePreference` ADD CONSTRAINT `ScopePreference_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ScopePreference` ADD CONSTRAINT `ScopePreference_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `ExternalAgent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ScopePreference` ADD CONSTRAINT `ScopePreference_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- SolutionProposal
ALTER TABLE `SolutionProposal` ADD CONSTRAINT `SolutionProposal_externalNeedId_fkey` FOREIGN KEY (`externalNeedId`) REFERENCES `ExternalNeed`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SolutionProposal` ADD CONSTRAINT `SolutionProposal_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SolutionProposal` ADD CONSTRAINT `SolutionProposal_selectedById_fkey` FOREIGN KEY (`selectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- BudgetLine
ALTER TABLE `BudgetLine` ADD CONSTRAINT `BudgetLine_solutionProposalId_fkey` FOREIGN KEY (`solutionProposalId`) REFERENCES `SolutionProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- PromiseP2P
ALTER TABLE `PromiseP2P` ADD CONSTRAINT `PromiseP2P_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PromiseP2P` ADD CONSTRAINT `PromiseP2P_sponsorId_fkey` FOREIGN KEY (`sponsorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- BonusPool
ALTER TABLE `BonusPool` ADD CONSTRAINT `BonusPool_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- BonusVote
ALTER TABLE `BonusVote` ADD CONSTRAINT `BonusVote_bonusPoolId_fkey` FOREIGN KEY (`bonusPoolId`) REFERENCES `BonusPool`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BonusVote` ADD CONSTRAINT `BonusVote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlertaZonal
ALTER TABLE `AlertaZonal` ADD CONSTRAINT `AlertaZonal_emisorId_fkey` FOREIGN KEY (`emisorId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SkillProposal
ALTER TABLE `SkillProposal` ADD CONSTRAINT `SkillProposal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SkillEndorsement
ALTER TABLE `SkillEndorsement` ADD CONSTRAINT `SkillEndorsement_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `SkillProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SkillEndorsement` ADD CONSTRAINT `SkillEndorsement_endorserId_fkey` FOREIGN KEY (`endorserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SkillMigration
ALTER TABLE `SkillMigration` ADD CONSTRAINT `SkillMigration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SkillMigration` ADD CONSTRAINT `SkillMigration_sourceTreeId_fkey` FOREIGN KEY (`sourceTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SkillMigration` ADD CONSTRAINT `SkillMigration_targetTreeId_fkey` FOREIGN KEY (`targetTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- TrustTreaty
ALTER TABLE `TrustTreaty` ADD CONSTRAINT `TrustTreaty_sourceTreeId_fkey` FOREIGN KEY (`sourceTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TrustTreaty` ADD CONSTRAINT `TrustTreaty_targetTreeId_fkey` FOREIGN KEY (`targetTreeId`) REFERENCES `Tree`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SearchPass
ALTER TABLE `SearchPass` ADD CONSTRAINT `SearchPass_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- InterviewInvitation
ALTER TABLE `InterviewInvitation` ADD CONSTRAINT `InterviewInvitation_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `InterviewInvitation` ADD CONSTRAINT `InterviewInvitation_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Prisma migration tracking table (keeps Prisma happy)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
    `id`                  VARCHAR(36) NOT NULL,
    `checksum`            VARCHAR(64) NOT NULL,
    `finished_at`         DATETIME(3) NULL,
    `migration_name`      VARCHAR(255) NOT NULL,
    `logs`                TEXT NULL,
    `rolled_back_at`      DATETIME(3) NULL,
    `started_at`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `applied_steps_count` INT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — All 37 tables + foreign keys initialized.
-- ═══════════════════════════════════════════════════════════════════════════════
