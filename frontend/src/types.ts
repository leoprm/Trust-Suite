export interface Need {
  id: string;
  title: string;
  description?: string;
  importance?: number;
  status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  treeId: string;
  creatorId?: string;
  creator?: { username: string };
  createdAt?: string;
  pointsAllocated?: number;
}

export interface Idea {
  id: string;
  title: string;
  description?: string;
  likesCount: number;
  likedByMe?: boolean;
  creatorId?: string;
  creator?: { username: string };
  createdAt?: string;
  isGlobal?: boolean;
  preValidated?: boolean;
  needId: string;
}
