import { prisma } from "../index";

/**
 * Downloads a GGUF model from HuggingFace using huggingface_hub CLI (Python)
 * or direct HTTP download as fallback.
 * 
 * The actual download logic will be implemented with llama.cpp integration.
 * For now, this is a placeholder that updates the model status.
 */
export async function downloadModelJob(modelId: string): Promise<void> {
  const model = await prisma.modelRegistry.findUnique({ where: { id: modelId } });
  if (!model) {
    console.error(`[ModelDownload] Model ${modelId} not found`);
    return;
  }

  console.log(`[ModelDownload] Starting download: ${model.hfRepo}/${model.filename}`);
  
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const path = await import("path");
  const fs = await import("fs");

  const modelsDir = path.resolve(__dirname, "../../models");
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const outputPath = path.join(modelsDir, model.filename);

  try {
    // Try huggingface_hub CLI first
    const repoId = model.hfRepo;
    const cmd = `python3 -m huggingface_hub download ${repoId} ${model.filename} --local-dir ${modelsDir} --local-dir-use-symlinks False 2>&1`;
    
    console.log(`[ModelDownload] Running: ${cmd}`);
    const { stdout } = await execAsync(cmd, { timeout: 600000 }); // 10 min timeout
    console.log(`[ModelDownload] stdout: ${stdout.slice(0, 500)}`);

    // Get file size
    const stats = fs.statSync(outputPath);

    await prisma.modelRegistry.update({
      where: { id: modelId },
      data: {
        status: "READY",
        sizeBytes: BigInt(stats.size),
        downloadedAt: new Date(),
      },
    });

    console.log(`[ModelDownload] Model ${modelId} downloaded: ${stats.size} bytes`);
  } catch (err: any) {
    console.error(`[ModelDownload] Download failed for ${modelId}:`, err.message);
    
    await prisma.modelRegistry.update({
      where: { id: modelId },
      data: { status: "ERROR" },
    });
  }
}
