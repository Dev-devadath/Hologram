import { exec, spawn } from "child_process";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import os from "os";

const execCommand = ({ command, executable, args }) => {
  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === "win32";

    // If executable and args are provided, use spawn (better for Windows)
    if (executable && args) {
      // Check if executable exists first
      if (!existsSync(executable)) {
        const binDir = executable.replace(/[^\\\/]+$/, "");
        reject(
          new Error(
            `Executable not found: ${executable}\n\nPlease download Rhubarb Lip-Sync from https://github.com/DanielSWolf/rhubarb-lip-sync/releases\nExtract it to: ${binDir}`
          )
        );
        return;
      }

      // DO NOT use shell with spawn - that defeats the purpose!
      // spawn is designed to execute files directly without shell interpretation
      const process = spawn(executable, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          const errorMessage = stderr
            ? `${stderr}`
            : `Process exited with code ${code}`;
          reject(new Error(errorMessage));
          return;
        }
        resolve(stdout);
      });

      process.on("error", (error) => {
        // This catches ENOENT and other spawn errors
        reject(
          new Error(
            `Failed to spawn process: ${error.message}\nExecutable: ${executable}`
          )
        );
      });
    } else {
      // Fallback to exec for backward compatibility
      const options = isWindows ? { shell: true } : {};

      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          const errorMessage = stderr
            ? `${error.message}\n${stderr}`
            : error.message;
          reject(new Error(errorMessage));
          return;
        }
        resolve(stdout);
      });
    }
  });
};

const readJsonTranscript = async ({ fileName }) => {
  const data = await fs.readFile(fileName, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async ({ fileName }) => {
  const data = await fs.readFile(fileName);
  return data.toString("base64");
};

export { execCommand, readJsonTranscript, audioFileToBase64 };
