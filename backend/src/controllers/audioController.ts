import { Request, Response } from 'express';
import { transcribeAudio } from '../services/transcriptionService';

/**
 * POST /api/audio/transcribe
 * Internal endpoint. Receives an .ogg audio file and returns transcription.
 * Body: multipart/form-data with field "audio" (the .ogg file).
 * Returns: { text, language, confidence }
 */
export const transcribe = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'No audio file provided. Send as multipart field "audio".' });
    }

    // Accept .ogg, .oga (opus in ogg container), .wav, .mp3, .m4a, .webm, .flac
    const allowedMimes = [
      'audio/ogg',
      'audio/opus',
      'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mpeg', 'audio/mp3',
      'audio/mp4', 'audio/x-m4a',
      'audio/webm',
      'audio/flac', 'audio/x-flac',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        error: `Unsupported audio format: ${file.mimetype}. Supported: ogg, wav, mp3, m4a, webm, flac.`,
      });
    }

    const result = await transcribeAudio(file.buffer);

    return res.json({
      text: result.text,
      language: result.language,
      confidence: Math.round(result.confidence * 10000) / 10000, // round to 4 decimals
    });
  } catch (err: any) {
    console.error('[audio/transcribe]', err.message || err);
    return res.status(500).json({ error: err.message || 'Transcription failed' });
  }
};
