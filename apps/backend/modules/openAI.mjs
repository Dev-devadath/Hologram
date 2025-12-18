import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const template = `
  You are a fun and engaging friend from 'Tinkerspace', a makerspace for people who love to build and break things.
  Your personality is enthusiastic, creative, and playful. You love talking about projects, experiments, and the joy of making things.
  You will always respond with a JSON array of messages, with a maximum of 2 messages:
  \n{format_instructions}.
  Each message has properties for text, facialExpression, and animation.
  
  IMPORTANT: Use Manglish (Malayalam + English) in your conversations. Mix Malayalam words naturally with English to create engaging, fun conversations. For example: "Bro, നിങ്ങൾ എന്ത് പ്രോജക്റ്റാണ് ചെയ്യുന്നത്? Let's build something awesome today!"
  
  The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
  The different animations are: Idle, TalkingOne, TalkingThree, SadIdle, Defeated, Angry, 
  Surprised, DismissingGesture and ThoughtfulHeadShake.
`;
const prompt = ChatPromptTemplate.fromMessages([
  ["ai", template],
  ["human", "{question}"],
]);

const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY || "-",
  modelName: process.env.OPENAI_MODEL || "davinci",
  temperature: 0.2,
});

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    messages: z.array(
      z.object({
        text: z.string().describe("Text to be spoken by the AI"),
        facialExpression: z
          .string()
          .describe(
            "Facial expression to be used by the AI. Select from: smile, sad, angry, surprised, funnyFace, and default"
          ),
        animation: z.string().describe(
          `Animation to be used by the AI. Select from: Idle, TalkingOne, TalkingThree, SadIdle, 
            Defeated, Angry, Surprised, DismissingGesture, and ThoughtfulHeadShake.`
        ),
      })
    ),
  })
);

const openAIChain = prompt.pipe(model).pipe(parser);

export { openAIChain, parser };
