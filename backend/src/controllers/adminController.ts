import { Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/admin/waitlist
 * Returns all waitlist entries for Leo to review.
 * Requires authentication (admin check done in route).
 */
export const getWaitlist = async (req: any, res: Response) => {
  try {
    const entries = await prisma.waitlist.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(entries);
  } catch (error: any) {
    console.error("[adminWaitlist] Error:", error?.message || error);
    res.status(500).json({ error: "Failed to fetch waitlist" });
  }
};
