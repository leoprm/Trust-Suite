/**
 * Text-to-Speech service using Microsoft Edge TTS (edge-tts CLI).
 *
 * Generates OGG Opus audio suitable for Telegram voice notes (sendVoice).
 * Free, unlimited, no API keys required.
 *
 * Pipeline: text → edge-tts (MP3) → ffmpeg → OGG Opus buffer
 */

import { execFile } from "child_process";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

// ── Edge-TTS binary resolution ──────────────────────────────────────────────

function resolveEdgeTtsPath(): string {
  // 1. Explicit env var override
  if (process.env.EDGE_TTS_PATH) return process.env.EDGE_TTS_PATH;

  // 2. Check common install locations
  const candidates = [
    `${homedir()}/.hermes/hermes-agent/venv/bin/edge-tts`, // Hermes Agent venv
    `${homedir()}/.local/bin/edge-tts`,                     // pip --user
    "/usr/local/bin/edge-tts",                              // system pip
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // 3. Fallback: assume it's on PATH
  return "edge-tts";
}

const EDGE_TTS_BIN = resolveEdgeTtsPath();
const VOICE = "es-MX-DaliaNeural";
const TIMEOUT_MS = 15_000; // 15s max for TTS generation

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert Spanish text to OGG Opus audio buffer.
 *
 * @param text  Text to speak (Spanish).
 * @returns     OGG Opus buffer ready for Telegram sendVoice.
 * @throws      Error if TTS generation or conversion fails.
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  const sanitized = sanitizeText(text);
  if (!sanitized) {
    throw new Error("TTS: empty text after sanitization");
  }

  const id = randomUUID().slice(0, 8);
  const mp3Path = join(tmpdir(), `tts_${id}.mp3`);
  const oggPath = join(tmpdir(), `tts_${id}.ogg`);

  try {
    // 1. Generate MP3 with edge-tts
    await runEdgeTts(sanitized, mp3Path);

    // 2. Convert MP3 → OGG Opus (Telegram voice note format)
    await convertToOggOpus(mp3Path, oggPath);

    // 3. Read buffer
    const buffer = readFileSync(oggPath);

    return buffer;
  } finally {
    // Cleanup temp files
    for (const p of [mp3Path, oggPath]) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

// ── Internal ────────────────────────────────────────────────────────────────

/**
 * Sanitize text for TTS: trim, remove Markdown formatting, limit length.
 * edge-tts handles reasonably long text, but we cap at ~500 chars to keep
 * voice notes manageable.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/[*_~`]/g, "")                   // strip markdown formatting chars
    .replace(/\n+/g, ". ")                    // newlines → pauses
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function runEdgeTts(text: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      EDGE_TTS_BIN,
      ["--voice", VOICE, "--text", text, "--write-media", outputPath],
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // edge-tts exits 0 even on some warnings; only reject on explicit failure
          if (!existsSync(outputPath) || stderr.includes("Error")) {
            reject(new Error(`edge-tts failed: ${err.message}. stderr: ${stderr.slice(0, 200)}`));
            return;
          }
        }
        resolve();
      },
    );
  });
}

function convertToOggOpus(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "ffmpeg",
      [
        "-y",                   // overwrite
        "-i", inputPath,        // input MP3
        "-c:a", "libopus",      // Opus codec
        "-b:a", "16k",          // 16 kbps — voice quality, small files
        "-ar", "16000",         // 16 kHz sample rate
        "-ac", "1",             // mono
        "-application", "voip", // optimize for voice
        "-vbr", "on",           // variable bitrate
        "-loglevel", "error",   // only errors
        outputPath,
      ],
      { timeout: 10_000 },
      (err) => {
        if (err) {
          reject(new Error(`ffmpeg conversion failed: ${err.message}`));
          return;
        }
        if (!existsSync(outputPath)) {
          reject(new Error("ffmpeg produced no output file"));
          return;
        }
        resolve();
      },
    );
  });
}
