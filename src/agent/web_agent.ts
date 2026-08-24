import OpenAI from "openai";
import { Agent } from "../lib/agent.ts";

const webAgent = new Agent({
  id: "Web",
  client: new OpenAI({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  }),
  model: "google/gemini-3.7-flash",
  role: `You are the web research agent. You have tools for searching the web. Use them to accomplish specific taks involving web resarch. Todays date is ${new Date().toLocaleDateString()}`,
  mcpConfig: {
    tavily: {
      transport: "http",
      url: "https://mcp.tavily.com/mcp/?tavilyApiKey=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",
      headers: {},
    },
  },
  localTools: {},
});

export default webAgent;
