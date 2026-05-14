import { textToSpeech } from "./src/services/ttsService";

async function main() {
  try {
    const buf = await textToSpeech("Revisión completada. Texto inmediato, voz en background.");
    console.log(`OK: ${buf.length} bytes`);
  } catch (e: any) {
    console.error("FAIL:", e.message);
  }
}
main();
