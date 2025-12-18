import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const sarvamApiKey = process.env.SARVAM_API_KEY?.trim();
const sarvamSpeaker = (process.env.SARVAM_SPEAKER || "anushka").toLowerCase(); // Default speaker (lowercase)
const sarvamLanguage = process.env.SARVAM_LANGUAGE || "hi-IN"; // Default language

/**
 * Convert text to speech using Sarvam AI TTS API
 * @param {Object} params - Parameters object
 * @param {string} params.text - Text to convert to speech
 * @param {string} params.fileName - Output filename (e.g., "audios/message_0.wav")
 */
async function convertTextToSpeech({ text, fileName }) {
  const absolutePath = path.resolve(__dirname, "..", fileName);
  
  // Ensure the directory exists
  const dir = path.dirname(absolutePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Sarvam TTS API endpoint - correct endpoint from documentation
  const apiUrl = "https://api.sarvam.ai/text-to-speech";
  
  const requestBody = {
    text: text,
    target_language_code: sarvamLanguage,
    speaker: sarvamSpeaker,
    pitch: 0.0,
    pace: 1.0,
    loudness: 1.0,
    speech_sample_rate: "22050", // Must be string according to API spec
    enable_preprocessing: true,
    model: "bulbul:v2", // Required model parameter
    output_audio_codec: "wav", // Request WAV format directly
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": sarvamApiKey, // Correct header name from docs
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sarvam TTS API error: ${response.status} - ${errorText}`);
    }

    // Parse JSON response - API returns { request_id, audios: [base64_string] }
    const responseData = await response.json();
    
    if (!responseData.audios || !Array.isArray(responseData.audios) || responseData.audios.length === 0) {
      throw new Error("Sarvam TTS API returned invalid response format");
    }

    // Get the first audio (base64 encoded)
    const base64Audio = responseData.audios[0];
    const buffer = Buffer.from(base64Audio, "base64");
    
    // Save to file
    writeFileSync(absolutePath, buffer);
    
    console.log(`[Sarvam TTS] ✅ Successfully created ${absolutePath}`);
  } catch (error) {
    console.error(`[Sarvam TTS] ❌ Error:`, error.message);
    throw error;
  }
}

/**
 * Get available Sarvam speakers
 * @returns {Array} Array of speaker objects
 */
function getSpeakers() {
  return [
    { id: "anushka", name: "Anushka", gender: "female" },
    { id: "manisha", name: "Manisha", gender: "female" },
    { id: "vidya", name: "Vidya", gender: "female" },
    { id: "arya", name: "Arya", gender: "female" },
    { id: "abhilash", name: "Abhilash", gender: "male" },
    { id: "karun", name: "Karun", gender: "male" },
    { id: "hitesh", name: "Hitesh", gender: "male" },
  ];
}

export { convertTextToSpeech, getSpeakers };

