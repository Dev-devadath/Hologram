import fs from "fs";
import path from "path";
import { execCommand } from "./files.mjs";

async function convertAudioToMp3({ audioData }) {
  const dir = 'tmp';
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
  const inputPath = path.join(dir, "input.webm");
  fs.writeFileSync(inputPath, audioData);
  const outputPath = path.join(dir, "output.mp3");
  // Quote paths for Windows compatibility
  await execCommand({ command: `ffmpeg -i "${inputPath}" "${outputPath}"` });
  const mp3AudioData = fs.readFileSync(outputPath);
  fs.unlinkSync(inputPath);
  fs.unlinkSync(outputPath);
  return mp3AudioData;
}

async function convertAudioToWav({ audioData }) {
  const dir = 'tmp';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  
  const inputPath = path.join(dir, "input.webm");
  const outputPath = path.join(dir, "output.wav");
  
  fs.writeFileSync(inputPath, audioData);
  
  // Convert to WAV: 16kHz mono, 16-bit PCM, volume boost for quiet audio
  await execCommand({ 
    command: `ffmpeg -i "${inputPath}" -acodec pcm_s16le -ar 16000 -ac 1 -af "volume=2.0" -f wav -y "${outputPath}"` 
  });
  
  const wavAudioData = fs.readFileSync(outputPath);
  
  // Cleanup
  fs.unlinkSync(inputPath);
  fs.unlinkSync(outputPath);
  
  return wavAudioData;
}

export { convertAudioToMp3, convertAudioToWav };