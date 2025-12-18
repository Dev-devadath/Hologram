import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { openAIChain, parser } from "./modules/openAI.mjs";
import { lipSync, lipSyncStream } from "./modules/lip-sync.mjs";
import { sendDefaultMessages, defaultResponse } from "./modules/defaultMessages.mjs";
import { convertAudioToText } from "./modules/deepgram.mjs";
import { getSpeakers } from "./modules/sarvamTTS.mjs";

dotenv.config();

const app = express();
// Increase body size limit for audio data (base64 encoded audio can be large)
app.use(express.json({ limit: '50mb' }));
app.use(cors());
const port = 3000;

app.get("/voices", async (req, res) => {
  try {
    const speakers = getSpeakers();
    res.send(speakers);
  } catch (error) {
    console.error("[Server] Error fetching voices:", error.message);
    res.status(500).send({ error: "Failed to fetch voices" });
  }
});

app.post("/tts", async (req, res) => {
  const userMessage = await req.body.message;
  const defaultMessages = await sendDefaultMessages({ userMessage });
  if (defaultMessages) {
    res.send({ messages: defaultMessages });
    return;
  }
  let openAImessages;
  try {
    openAImessages = await openAIChain.invoke({
      question: userMessage,
      format_instructions: parser.getFormatInstructions(),
    });
  } catch (error) {
    openAImessages = defaultResponse;
  }
  
  // Use streaming for faster first response
  const useStreaming = req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream');
  
  if (useStreaming) {
    // Stream responses using Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const stream = lipSyncStream({ messages: openAImessages.messages });
    const allMessages = [];
    
    for await (const { index, message, done, error } of stream) {
      allMessages[index] = message;
      
      // Send each message as it's ready
      const dataToSend = `data: ${JSON.stringify({ 
        index, 
        message, 
        done,
        error 
      })}\n\n`;
      
      console.log(`[Server] Streaming message ${index} (done: ${done})`);
      res.write(dataToSend);
      
      // Force flush to ensure data is sent immediately
      if (res.flush) {
        res.flush();
      }
      
      if (done) {
        // Send final complete response
        const finalData = `data: ${JSON.stringify({ 
          messages: allMessages,
          complete: true 
        })}\n\n`;
        res.write(finalData);
        if (res.flush) {
          res.flush();
        }
        res.end();
        break;
      }
    }
  } else {
    // Standard non-streaming response (backward compatible)
    openAImessages = await lipSync({ messages: openAImessages.messages });
    res.send({ messages: openAImessages });
  }
});

app.post("/sts", async (req, res) => {
  try {
    const base64Audio = req.body.audio;
    if (!base64Audio) {
      return res.status(400).send({ error: "No audio data provided" });
    }
    
    const audioData = Buffer.from(base64Audio, "base64");
    const userMessage = await convertAudioToText({ audioData });
    
    if (!userMessage || userMessage.trim().length === 0) {
      return res.status(400).send({ error: "Could not transcribe audio" });
    }
    
    let openAImessages;
    try {
      openAImessages = await openAIChain.invoke({
        question: userMessage,
        format_instructions: parser.getFormatInstructions(),
      });
    } catch (error) {
      console.error("[Server] Error in OpenAI chain:", error.message);
      openAImessages = defaultResponse;
    }
    
    // Use streaming for faster first response
    const useStreaming = req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream');
    
    if (useStreaming) {
      // Stream responses using Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const stream = lipSyncStream({ messages: openAImessages.messages });
      const allMessages = [];
      
      for await (const { index, message, done, error } of stream) {
        allMessages[index] = message;
        
        // Send each message as it's ready
        const dataToSend = `data: ${JSON.stringify({ 
          index, 
          message, 
          done,
          error 
        })}\n\n`;
        
        console.log(`[Server] Streaming message ${index} (done: ${done})`);
        res.write(dataToSend);
        
        // Force flush to ensure data is sent immediately
        if (res.flush) {
          res.flush();
        }
        
        if (done) {
          // Send final complete response
          const finalData = `data: ${JSON.stringify({ 
            messages: allMessages,
            complete: true 
          })}\n\n`;
          res.write(finalData);
          if (res.flush) {
            res.flush();
          }
          res.end();
          break;
        }
      }
    } else {
      // Standard non-streaming response (backward compatible)
      openAImessages = await lipSync({ messages: openAImessages.messages });
      res.send({ messages: openAImessages });
    }
  } catch (error) {
    console.error("[Server] Error in /sts endpoint:", error.message);
    res.status(500).send({ error: "Failed to process audio", message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Jack are listening on port ${port}`);
});
