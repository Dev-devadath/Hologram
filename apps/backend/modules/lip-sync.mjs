import { convertTextToSpeech } from "./sarvamTTS.mjs";
import { getPhonemes } from "./rhubarbLipSync.mjs";
import { readJsonTranscript, audioFileToBase64 } from "../utils/files.mjs";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_RETRIES = 10;
const RETRY_DELAY = 2000; // 2 seconds delay for rate limiting
const TTS_CONCURRENCY = 2; // Process 2 TTS requests in parallel
const INITIAL_DELAY = 100; // Small initial delay to avoid burst requests

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Process TTS with retry logic
async function processTTSWithRetry({ text, fileName, index }) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await convertTextToSpeech({ text, fileName });
      // File is immediately available after writeFileSync (synchronous)
      if (existsSync(fileName) || existsSync(path.resolve(__dirname, "..", fileName))) {
        console.log(`[LipSync] ✅ Message ${index} converted to speech successfully - File: ${fileName}`);
        return true;
      } else {
        throw new Error(`File ${fileName} was not created`);
      }
    } catch (error) {
      if (error.statusCode === 401 || error.status === 401) {
        console.error(`[LipSync] ❌ Authentication failed for message ${index}. Check your API key.`);
        throw error; // Don't retry auth errors
      }
      if (error.statusCode === 429 || error.status === 429) {
        if (attempt < MAX_RETRIES - 1) {
          const waitTime = RETRY_DELAY * (attempt + 1); // Exponential backoff
          console.log(`[LipSync] ⚠️ Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${MAX_RETRIES}...`);
          await delay(waitTime);
          continue;
        }
      }
      if (attempt === MAX_RETRIES - 1) {
        console.error(`[LipSync] ❌ Failed to convert message ${index} after ${MAX_RETRIES} attempts:`, error.message);
        throw error;
      }
    }
  }
  return false;
}

// Process TTS calls in parallel batches with concurrency control
async function processTTSInParallel(messages) {
  const results = new Map();
  const successfulConversions = new Set();
  
  // Process in batches to control concurrency
  for (let i = 0; i < messages.length; i += TTS_CONCURRENCY) {
    const batch = messages.slice(i, i + TTS_CONCURRENCY);
    
    // Add small delay before batch (except first batch)
    if (i > 0) {
      await delay(INITIAL_DELAY);
    }
    
    const batchPromises = batch.map(async (message, batchIndex) => {
      const index = i + batchIndex;
      const fileName = `audios/message_${index}.wav`;
      
      console.log(`[LipSync] 📤 Processing message ${index}/${messages.length - 1}: "${message.text.substring(0, 50)}..."`);
      
      try {
        const success = await processTTSWithRetry({ text: message.text, fileName, index });
        if (success) {
          successfulConversions.add(index);
          results.set(index, { success: true, fileName });
        } else {
          results.set(index, { success: false, fileName });
        }
      } catch (error) {
        results.set(index, { success: false, fileName, error });
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  return { successfulConversions, results };
}

// Process a single message completely (TTS + LipSync + Audio encoding)
async function processMessageComplete(message, index) {
  const fileName = `audios/message_${index}.wav`;
  const jsonFileName = `audios/message_${index}.json`;
  
  try {
    // Process phonemes (lip sync)
    console.log(`[LipSync] Processing phonemes for message ${index}...`);
    await getPhonemes({ message: index });
    
    // Add audio and lipsync data
    if (existsSync(fileName) || existsSync(path.resolve(__dirname, "..", fileName))) {
      message.audio = await audioFileToBase64({ fileName });
      console.log(`[LipSync] ✅ Added audio data to message ${index}`);
    }
    
    const jsonPath = path.resolve(__dirname, "..", jsonFileName);
    if (existsSync(jsonFileName) || existsSync(jsonPath)) {
      message.lipsync = await readJsonTranscript({ fileName: jsonFileName });
      console.log(`[LipSync] ✅ Added lipsync data to message ${index}`);
    }
    
    return message;
  } catch (error) {
    console.error(`[LipSync] ❌ Error while processing message ${index}:`, error.message);
    throw error;
  }
}

// Standard lipSync function (processes all messages, returns all at once)
const lipSync = async ({ messages }) => {
  console.log(`[LipSync] Processing ${messages.length} message(s) in parallel batches...`);
  
  // Step 1: Process TTS in parallel batches
  const { successfulConversions } = await processTTSInParallel(messages);
  
  // Summary of created files
  console.log("=".repeat(80));
  if (successfulConversions.size === 0) {
    console.log(`[LipSync] ⚠️ No audio files were created - skipping file processing`);
    return messages;
  }
  
  const createdFiles = Array.from(successfulConversions).map(i => `audios/message_${i}.wav`).join(", ");
  console.log(`[LipSync] ✅ Successfully created ${successfulConversions.size} WAV file(s): ${createdFiles}`);
  console.log("=".repeat(80));
  console.log(`[LipSync] Processing ${successfulConversions.size} audio file(s) in parallel...`);
  
  // Step 2: Process lip sync and encode audio in parallel
  await Promise.all(
    Array.from(successfulConversions).map(async (index) => {
      try {
        await processMessageComplete(messages[index], index);
      } catch (error) {
        console.error(`[LipSync] ❌ Failed to process message ${index}:`, error.message);
      }
    })
  );

  return messages;
};

// Streaming version: aggressive pipeline - TTS and lip sync overlap with streaming
async function* lipSyncStream({ messages }) {
  console.log(`[LipSync] Streaming ${messages.length} message(s) with aggressive pipeline processing...`);
  
  if (messages.length === 0) return;
  
  // Track ongoing TTS and lip sync promises
  const ttsPromises = new Map();
  const lipSyncPromises = new Map();
  
  // Process first message: TTS → Lip Sync → Stream
  const firstMessage = messages[0];
  const firstFileName = `audios/message_0.wav`;
  
  try {
    // Step 1: TTS for message 0
    console.log(`[LipSync] 📤 TTS: Processing message 0/${messages.length - 1}: "${firstMessage.text.substring(0, 50)}..."`);
    await processTTSWithRetry({ text: firstMessage.text, fileName: firstFileName, index: 0 });
    console.log(`[LipSync] ✅ TTS complete for message 0`);
    
    // Step 2: Start lip sync for message 0 AND TTS for message 1 in parallel (if exists)
    if (messages.length > 1) {
      const nextMessage = messages[1];
      const nextFileName = `audios/message_1.wav`;
      
      console.log(`[LipSync] 🔄 Pipeline: Starting lip sync for message 0 AND TTS for message 1 in parallel...`);
      console.log(`[LipSync] 📤 TTS: Processing message 1/${messages.length - 1}: "${nextMessage.text.substring(0, 50)}..."`);
      
      // Start both in parallel
      const lipSync0Promise = processMessageComplete(firstMessage, 0);
      const tts1Promise = processTTSWithRetry({ text: nextMessage.text, fileName: nextFileName, index: 1 });
      ttsPromises.set(1, tts1Promise);
      
      // Wait for lip sync 0 to complete first (so we can stream it)
      await lipSync0Promise;
      console.log(`[LipSync] ✅ Lip sync complete for message 0`);
      
      // Stream message 0 immediately
      console.log(`[LipSync] ✅ Message 0 ready, streaming...`);
      yield { index: 0, message: firstMessage, done: false, error: null };
      
      // While message 0 is streaming, wait for TTS 1 and immediately start lip sync 1
      const tts1Result = await tts1Promise;
      ttsPromises.delete(1);
      console.log(`[LipSync] ✅ TTS complete for message 1`);
      
      // Immediately start lip sync for message 1 (while message 0 is still streaming)
      console.log(`[LipSync] 🔄 Pipeline: Starting lip sync for message 1 while message 0 is streaming...`);
      const lipSync1Promise = processMessageComplete(nextMessage, 1);
      lipSyncPromises.set(1, lipSync1Promise);
      
      // Process remaining messages
      for (let index = 1; index < messages.length; index++) {
        const currentMessage = messages[index];
        
        try {
          // Wait for current message's lip sync (might already be in progress)
          let lipSyncPromise = lipSyncPromises.get(index);
          if (!lipSyncPromise) {
            // If not started, start it now
            lipSyncPromise = processMessageComplete(currentMessage, index);
          }
          await lipSyncPromise;
          lipSyncPromises.delete(index);
          console.log(`[LipSync] ✅ Lip sync complete for message ${index}`);
          
          // Stream current message immediately
          console.log(`[LipSync] ✅ Message ${index} ready, streaming...`);
          yield { 
            index, 
            message: currentMessage, 
            done: index === messages.length - 1, 
            error: null 
          };
          
          // While current message is streaming, start processing next message
          if (index < messages.length - 1) {
            const nextIndex = index + 1;
            const nextMsg = messages[nextIndex];
            const nextFile = `audios/message_${nextIndex}.wav`;
            
            // Check if TTS for next message is already in progress
            let nextTTSPromise = ttsPromises.get(nextIndex);
            if (!nextTTSPromise) {
              // Start TTS for next message
              console.log(`[LipSync] 🔄 Pipeline: Starting TTS for message ${nextIndex} while message ${index} is streaming...`);
              console.log(`[LipSync] 📤 TTS: Processing message ${nextIndex}/${messages.length - 1}: "${nextMsg.text.substring(0, 50)}..."`);
              nextTTSPromise = processTTSWithRetry({ 
                text: nextMsg.text, 
                fileName: nextFile, 
                index: nextIndex 
              });
              ttsPromises.set(nextIndex, nextTTSPromise);
            }
            
            // Wait for TTS to complete (might already be done)
            await nextTTSPromise;
            ttsPromises.delete(nextIndex);
            console.log(`[LipSync] ✅ TTS complete for message ${nextIndex}`);
            
            // Immediately start lip sync for next message (while current is still streaming)
            console.log(`[LipSync] 🔄 Pipeline: Starting lip sync for message ${nextIndex} while message ${index} is streaming...`);
            const nextLipSyncPromise = processMessageComplete(nextMsg, nextIndex);
            lipSyncPromises.set(nextIndex, nextLipSyncPromise);
          }
        } catch (error) {
          console.error(`[LipSync] ❌ Failed to process message ${index}:`, error.message);
          yield { index, message: currentMessage, done: index === messages.length - 1, error: error.message };
        }
      }
    } else {
      // Only one message, process normally
      await processMessageComplete(firstMessage, 0);
      console.log(`[LipSync] ✅ Message 0 ready, streaming...`);
      yield { index: 0, message: firstMessage, done: true, error: null };
    }
  } catch (error) {
    console.error(`[LipSync] ❌ Failed to process message 0:`, error.message);
    yield { index: 0, message: firstMessage, done: true, error: error.message };
  }
}

export { lipSync, lipSyncStream };
