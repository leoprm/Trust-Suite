-- AlterTable: Add P2P_TRANSFER_OUT and P2P_TRANSFER_IN to WalletTransactionType enum
-- MySQL supports appending enum values without data rewrite

ALTER TABLE `WalletTransaction` MODIFY COLUMN `type` ENUM(
  'DEPOSIT',
  'WITHDRAWAL',
  'P2P_TRANSFER',
  'P2P_TRANSFER_OUT',
  'P2P_TRANSFER_IN',
  'TREE_PAYMENT',
  'MEMBER_REWARD',
  'REFUND',
  'LOCK',
  'UNLOCK',
  'FEE'
) NOT NULL;
