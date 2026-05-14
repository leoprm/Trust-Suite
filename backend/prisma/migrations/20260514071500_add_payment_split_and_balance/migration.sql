-- CreateTable
CREATE TABLE `PaymentSplit` (
  `id` varchar(191) NOT NULL,
  `needId` varchar(191) NOT NULL,
  `memberId` varchar(191) NOT NULL,
  `percentage` double NOT NULL,
  `reason` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `PaymentSplit_needId_idx` (`needId`),
  KEY `PaymentSplit_memberId_idx` (`memberId`),
  CONSTRAINT `PaymentSplit_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `TreeMember` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PaymentSplit_needId_fkey` FOREIGN KEY (`needId`) REFERENCES `Need` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberBalance` (
  `id` varchar(191) NOT NULL,
  `memberId` varchar(191) NOT NULL,
  `availableBalance` int NOT NULL DEFAULT '0',
  `pendingBalance` int NOT NULL DEFAULT '0',
  `stripeAccountId` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `MemberBalance_memberId_key` (`memberId`),
  CONSTRAINT `MemberBalance_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `TreeMember` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
