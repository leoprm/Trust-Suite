-- Add assignedTo and assignedToName to Todo table
ALTER TABLE Todo
  ADD COLUMN assignedTo BIGINT NULL,
  ADD COLUMN assignedToName VARCHAR(255) NULL;
