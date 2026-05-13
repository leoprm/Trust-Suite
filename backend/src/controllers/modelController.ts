import { Request, Response } from "express";
import { prisma } from "../index";
import { ModelStatus } from "@prisma/client";

/**
 * POST /api/models
 * Lista todos los modelos registrados.
 */
export async function listModels(_req: Request, res: Response) {
  try {
    const models = await prisma.modelRegistry.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ models });
  } catch (err: any) {
    console.error("[ModelController] listModels error:", err.message);
    res.status(500).json({ error: "Failed to list models" });
  }
}

/**
 * POST /api/models/download
 * Inicia la descarga de un modelo desde HuggingFace.
 * Body: { hfRepo: string, filename: string, name?: string }
 */
export async function downloadModel(req: Request, res: Response) {
  try {
    const { hfRepo, filename, name } = req.body;

    if (!hfRepo || !filename) {
      return res.status(400).json({ error: "hfRepo and filename are required" });
    }

    const modelName = name || filename.replace(".gguf", "");

    // Check if already registered
    const existing = await prisma.modelRegistry.findFirst({
      where: { hfRepo, filename },
    });

    if (existing) {
      return res.json({
        message: "Model already registered",
        model: existing,
      });
    }

    // Create registry entry with DOWNLOADING status
    const model = await prisma.modelRegistry.create({
      data: {
        name: modelName,
        hfRepo,
        filename,
        status: ModelStatus.DOWNLOADING,
      },
    });

    // Trigger async download (fire-and-forget via BullMQ or direct)
    // For now, we import dynamically to avoid circular deps
    try {
      const { downloadModelJob } = await import("../services/modelDownloadService");
      downloadModelJob(model.id).catch((err: Error) => {
        console.error(`[ModelController] Download failed for ${model.id}:`, err.message);
      });
    } catch (e: any) {
      console.warn("[ModelController] downloadModelJob not available, model registered as DOWNLOADING:", e.message);
    }

    res.status(201).json({
      message: "Model download started",
      model,
    });
  } catch (err: any) {
    console.error("[ModelController] downloadModel error:", err.message);
    res.status(500).json({ error: "Failed to start model download" });
  }
}
