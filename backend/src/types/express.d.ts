declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role?: string;
        isGuest?: boolean;
      };
    }
  }
}

export {};