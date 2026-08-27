import OpenAI from "openai";
import { Agent } from "../lib/agent.ts";
import getWeather from "../tools/getWeather.ts";
import browserAgent from "./browser_agent.ts";
import desktopAgent from "./desktop_agent.ts";
import webAgent from "./web_agent.ts";
import os from "node:os";
import { ImageGenerationProvider } from "../lib/image_generation_provider.ts";
import path from "node:path";
import { Voice, Voicebox } from "../lib/voice.ts";

const orchestratorAgent = new Agent({
  id: "Orchestrator Agent",
  client: new OpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  }),
  model: "google/gemini-3.7-flash",
  role: "Are are the orchestraion agent. You have a team of specialist for specific tasks. Use the browser agent for tasks requiring automating a browser or web scraping. Use the desktop agent for tasks requiring the file system. Use the web agent for tasks requiring search engine research",

  localTools: {},
  voice: new Voicebox({
    id: "9b95b612-4447-4084-83f4-cd9e9e586f06",
    engine: "qwen",
    modelSize: "1.7B",
  }),
  imageGeneration: {
    provider: new ImageGenerationProvider({
      apiKey: process.env.OPEN_ROUTER_API_KEY!,
      baseURL: "https://openrouter.ai/api/v1",
    }),
    model: "x-ai/grok-imagine-image-quality",
    imageDirectoryPath: path.join(os.homedir(), "Desktop/generatedImages"),
  },

  subagents: {
    browserAgent,
    desktopAgent,
    webAgent,
  },
});

export default orchestratorAgent;
