import OpenAI from "openai";
import { Agent } from "../lib/agent.ts";
import getWeather from "../tools/getWeather.ts";

const generalPurposeAgent = new Agent({
  id: "General Purpose",
  client: new OpenAI({
    apiKey: "no key",
    baseURL: "http://localhost:11434/v1",
  }),
  model: "gemma4:latest",
  role: "You are a helpful assistant, use the playwright browser tools to search the web.",
  mcpConfig: {
    playwright: {
      transport: "stdio",
      command: "npx",
      arguments: ["@playwright/mcp@latest"],
    },
  },
  localTools: { getWeather },
});

export default generalPurposeAgent;
