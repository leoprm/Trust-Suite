-- Add creatorId and dmMessageIds to KanbanProposal
ALTER TABLE KanbanProposal
  ADD COLUMN creatorId VARCHAR(191) NULL,
  ADD COLUMN dmMessageIds JSON NULL,
  ADD CONSTRAINT KanbanProposal_creatorId_fkey FOREIGN KEY (creatorId) REFERENCES User(id) ON DELETE SET NULL;
