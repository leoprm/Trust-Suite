-- KanbanVote: track who voted on each proposal (prevents double voting)
CREATE TABLE IF NOT EXISTS KanbanVote (
  id         VARCHAR(191) NOT NULL PRIMARY KEY,
  proposalId VARCHAR(191) NOT NULL,
  userId     VARCHAR(191) NOT NULL,
  vote       VARCHAR(10)  NOT NULL, -- "yes" | "no"
  createdAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX KanbanVote_proposalId_userId_key (proposalId, userId),
  INDEX KanbanVote_proposalId_idx (proposalId),

  CONSTRAINT KanbanVote_proposalId_fkey FOREIGN KEY (proposalId) REFERENCES KanbanProposal(id) ON DELETE CASCADE,
  CONSTRAINT KanbanVote_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
