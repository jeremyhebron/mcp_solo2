import OpenAI from "openai";
import { Agent } from "../lib/agent.ts";

const browserAgent = new Agent({
  id: "Browser",
  client: new OpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  }),
  model: "deepseek/deepseek-v4-pro",
  role: "You are a helpful assistant, use the playwright browser tools to search or scrape the web.",
  mcpConfig: {
    playwright: {
      transport: "stdio",
      command: "npx",
      arguments: ["@playwright/mcp@latest"],
    },
  },
  localTools: {},
});

export default browserAgent;
