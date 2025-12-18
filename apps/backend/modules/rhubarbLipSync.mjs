import { execCommand } from "../utils/files.mjs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { existsSync, readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getPhonemes = async ({ message }) => {
  try {
    const time = new Date().getTime();
    console.log(`Starting lip sync for message ${message}`);
    
    // Cross-platform rhubarb executable path
    const isWindows = os.platform() === "win32";
    const rhubarbExecutable = isWindows ? "rhubarb.exe" : "rhubarb";
    const binDir = path.join(__dirname, "..", "bin");
    
    // Try multiple possible locations:
    // 1. Directly in bin/ (if extracted correctly)
    let rhubarbPath = path.join(binDir, rhubarbExecutable);
    
    // 2. Inside a subdirectory (if ZIP was extracted as-is)
    if (!existsSync(rhubarbPath)) {
      // Look for any Rhubarb-* subdirectory
      try {
        const binContents = readdirSync(binDir, { withFileTypes: true });
        const rhubarbSubdir = binContents.find(
          (item) => item.isDirectory() && item.name.toLowerCase().includes("rhubarb")
        );
        
        if (rhubarbSubdir) {
          rhubarbPath = path.join(binDir, rhubarbSubdir.name, rhubarbExecutable);
          console.log(`[Rhubarb] Found in subdirectory: ${rhubarbSubdir.name}`);
        }
      } catch (error) {
        // If we can't read the directory, just use the original path
        console.warn(`[Rhubarb] Could not search subdirectories: ${error.message}`);
      }
    }
    
    // Use absolute paths for inputs/outputs
    const wavFilePath = path.resolve(__dirname, "..", "audios", `message_${message}.wav`);
    const jsonFilePath = path.resolve(__dirname, "..", "audios", `message_${message}.json`);
    
    // Use spawn with executable and args array (better Windows compatibility)
    // Using '-r pocketSphinx' for faster processing (faster than default phonetic mode)
    const args = [
      '-f', 'json',
      '-r', 'pocketSphinx', // Faster recognition mode
      '-o', jsonFilePath,
      wavFilePath
    ];
    
    console.log(`[Rhubarb] Executing: ${rhubarbPath} ${args.join(' ')}`);
    await execCommand({ executable: rhubarbPath, args });
    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error(`Error while getting phonemes for message ${message}:`, error);
    throw error; // Re-throw to allow caller to handle
  }
};

export { getPhonemes };