import { createClient } from "@deepgram/sdk";
import { Readable } from "stream";
import dotenv from "dotenv";
import { convertAudioToWav } from "../utils/audios.mjs";

dotenv.config();

const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

if (!deepgramApiKey) {
  console.warn("[Deepgram] Warning: DEEPGRAM_API_KEY not found in environment variables");
}

const deepgramClient = createClient(deepgramApiKey);

const TRANSCRIBE_OPTIONS = {
  model: "nova-2",
  smart_format: true,
  language: "en",
  punctuate: true,
};

async function convertAudioToText({ audioData }) {
  if (!deepgramApiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }

  if (!audioData || audioData.length === 0) {
    throw new Error("Audio data is empty or invalid");
  }

  // Try direct WebM transcription (faster, no conversion needed)
  try {
    const audioStream = Readable.from(audioData);
    const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
      audioStream,
      TRANSCRIBE_OPTIONS
    );

    if (error) throw error;

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (transcript?.trim()) {
      return transcript.trim();
    }
  } catch (webmError) {
    // Fallback to WAV conversion if WebM fails
    console.log(`[Deepgram] WebM failed, converting to WAV: ${webmError.message}`);
  }

  // Fallback: Convert to WAV and retry
  const wavAudioData = await convertAudioToWav({ audioData });
  if (!wavAudioData?.length) {
    throw new Error("Failed to convert audio to WAV format");
  }

  const audioStream = Readable.from(wavAudioData);
  const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
    audioStream,
    TRANSCRIBE_OPTIONS
  );

  if (error) {
    throw new Error(`Deepgram transcription error: ${error.message || JSON.stringify(error)}`);
  }

  const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (!transcript?.trim()) {
    throw new Error("Empty transcript returned from Deepgram");
  }

  return transcript.trim();
}

export { convertAudioToText };

