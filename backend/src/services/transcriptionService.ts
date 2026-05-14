import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const WHISPER_BIN = path.resolve(__dirname, '../../../whisper.cpp/build/bin/whisper-cli');
const WHISPER_MODEL = path.resolve(__dirname, '../../../whisper.cpp/models/ggml-tiny.bin');

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
}

/**
 * Converts an audio buffer (.ogg) to 16kHz mono WAV, then transcribes with whisper.cpp.
 * Returns { text, language, confidence }.
 */
export async function transcribeAudio(buffer: Buffer): Promise<TranscriptionResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-'));
  const inputOgg = path.join(tmpDir, 'input.ogg');
  const inputWav = path.join(tmpDir, 'input.wav');
  const outputJson = path.join(tmpDir, 'output');

  try {
    // Write the uploaded buffer to disk
    fs.writeFileSync(inputOgg, buffer);

    // Convert .ogg → 16kHz mono WAV with ffmpeg
    await ffmpeg(inputOgg, inputWav);

    // Transcribe with whisper.cpp
    const result = await whisperTranscribe(inputWav, outputJson);

    return result;
  } finally {
    // Cleanup temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function ffmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'ffmpeg',
      ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', output],
      { timeout: 30_000 },
      (err) => {
        if (err) return reject(new Error(`ffmpeg failed: ${err.message}`));
        resolve();
      },
    );
    // Suppress stderr (ffmpeg is verbose)
    child.stderr?.on('data', () => {});
  });
}

function whisperTranscribe(wavPath: string, outputPrefix: string): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      WHISPER_BIN,
      [
        '-m', WHISPER_MODEL,
        '-f', wavPath,
        '-l', 'auto',
        '-ojf',                         // output JSON full (includes token probabilities)
        '-of', outputPrefix,
        '--no-timestamps',
      ],
      { timeout: 120_000 },
      (err, _stdout, stderr) => {
        if (err) return reject(new Error(`whisper failed: ${err.message}`));

        // Parse the JSON output
        const jsonPath = outputPrefix + '.json';
        let raw: any;
        try {
          raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch {
          return reject(new Error('whisper produced invalid JSON output'));
        }

        const language: string = raw?.result?.language || 'unknown';
        const text: string = raw?.transcription?.[0]?.text?.trim() || '';

        // Compute average confidence from token probabilities
        const tokens: Array<{ p?: number }> = raw?.transcription?.[0]?.tokens || [];
        const realTokens = tokens.filter(t => typeof t.p === 'number');
        const confidence = realTokens.length > 0
          ? realTokens.reduce((sum, t) => sum + t.p!, 0) / realTokens.length
          : 0;

        // Parse language detection confidence from stderr if available
        // whisper prints: "auto-detected language: en (p = 0.976698)"
        const langMatch = stderr.match(/auto-detected language: (\w+)\s+\(p\s*=\s*([\d.]+)\)/);
        const langConfidence = langMatch ? parseFloat(langMatch[2]) : null;

        resolve({
          text,
          language,
          confidence: langConfidence ?? confidence,
        });
      },
    );
  });
}
