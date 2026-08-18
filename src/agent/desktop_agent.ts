import OpenAI from "openai";
import { Agent } from "../lib/agent.ts";

const desktopAgent = new Agent({
  id: "Desktop",
  client: new OpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  }),
  model: "deepseek/deepseek-v4-pro",
  role: "You are a helpful assistant, use the desktop tools to interact with the fil system.",
  mcpConfig: {
    "desktop-commander": {
      transport: "stdio",
      command: "npx",
      arguments: ["-y", "@wonderwhy-er/desktop-commander@latest"],
    },
  },
  localTools: {},
});

export default desktopAgent;
