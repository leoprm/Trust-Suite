-- CreateTable: TreeSandbox
CREATE TABLE `TreeSandbox` (
  `id` VARCHAR(191) NOT NULL,
  `treeId` VARCHAR(191) NOT NULL,
  `port` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'IDLE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `TreeSandbox_treeId_key` (`treeId`),
  UNIQUE INDEX `TreeSandbox_port_key` (`port`),
  CONSTRAINT `TreeSandbox_treeId_fkey` FOREIGN KEY (`treeId`) REFERENCES `Tree` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
