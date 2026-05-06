/*
  Warnings:

  - You are about to drop the column `score` on the `DifficultyVote` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,taskId]` on the table `DifficultyVote` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `DifficultyVote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `value` to the `DifficultyVote` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex skipped for MySQL: `DifficultyVote_taskId_userId_key` is needed by a foreign key constraint.
-- Keeping the old unique index is safe for a fresh local database.

-- AlterTable
ALTER TABLE `DifficultyVote` DROP COLUMN `score`,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'valido',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    ADD COLUMN `value` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `DifficultyVote_userId_taskId_key` ON `DifficultyVote`(`userId`, `taskId`);
