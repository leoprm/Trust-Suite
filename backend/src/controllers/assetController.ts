import { Request, Response } from 'express';
import { prisma } from '../index';

export const addAssetFund = async (req: any, res: Response) => {
  try {
    const { treeId, amount, type } = req.body; // type = 'FIAT' | 'PROPERTY'
    
    // For MVP, user contributes their real world asset completely freely to the Tree
    let fund = await prisma.assetFund.findFirst({
      where: { treeId, type } // One fund type per tree
    });

    if (fund) {
      fund = await prisma.assetFund.update({
        where: { id: fund.id },
        data: { balance: { increment: amount } }
      });
    } else {
      fund = await prisma.assetFund.create({
        data: {
          treeId,
          type,
          balance: amount
        }
      });
    }

    res.status(200).json({ message: 'Assets added successfully', fund });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add assets' });
  }
};
