import { OpenAIWhisperAudio } from "langchain/document_loaders/fs/openai_whisper_audio";
import { convertAudioToMp3 } from "../utils/audios.mjs";
import fs from "fs";
import os from "os";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const openAIApiKey = process.env.OPENAI_API_KEY;

async function convertAudioToText({ audioData }) {
  let outputPath;
  try {
    const mp3AudioData = await convertAudioToMp3({ audioData });
    // Use cross-platform temp directory
    outputPath = path.join(os.tmpdir(), `whisper-${Date.now()}.mp3`);
    fs.writeFileSync(outputPath, mp3AudioData);
    const loader = new OpenAIWhisperAudio(outputPath, { clientOptions: { apiKey: openAIApiKey } });
    const doc = (await loader.load()).shift();
    const transcribedText = doc.pageContent;
    
    // Clean up temp file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    
    return transcribedText;
  } catch (error) {
    console.error("[Whisper] Error converting audio to text:", error.message);
    // Clean up temp file if it exists
    if (outputPath && fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error("[Whisper] Error cleaning up temp file:", cleanupError.message);
      }
    }
    throw error;
  }
}

export { convertAudioToText };
