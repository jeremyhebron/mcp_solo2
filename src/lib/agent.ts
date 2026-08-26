import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import {
  GenerateImageTool,
  MCPTool,
  SubAgentTool,
  type LocalTool,
  type Tool,
} from "./tool.ts";
import { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ImageGenerationProvider } from "./image_generation_provider.ts";

type StdioMCPConfig = {
  transport: "stdio";
  command: string;
  arguments: string[];
};

type StreamableHTTPConfig = {
  transport: "http";
  url: string;
  headers: object;
};

type MCPConfig = Record<string, StdioMCPConfig | StreamableHTTPConfig>;

export class Agent {
  id: string;
  role: string;
  client: OpenAI;
  model: string;
  subagents?: Record<string, Agent>;
  messages: ChatCompletionMessageParam[];
  toolRegistry: Record<string, Tool>;
  mcpClients: Set<Client>;
  mcpConfig?: MCPConfig;
  imageGeneration?: {
    provider: ImageGenerationProvider;
    model: string;
    imageDirectoryPath: string;
  };

  constructor(args: {
    id: string;
    role: string;
    client: OpenAI;
    model: string;
    localTools: Record<string, LocalTool<any, any>>;
    mcpConfig?: MCPConfig;
    subagents?: Record<string, Agent>;
    imageGeneration?: {
      provider: ImageGenerationProvider;
      model: string;
      imageDirectoryPath: string;
    };
  }) {
    this.id = args.id;
    this.toolRegistry = {};
    this.role = args.role;
    this.client = args.client;
    this.model = args.model;

    //add image gen tool
    if (args.imageGeneration) {
      this.imageGeneration = args.imageGeneration;
      this.toolRegistry["generate_image"] = new GenerateImageTool({
        model: this.imageGeneration.model,
        imageGenerationProvider: this.imageGeneration.provider,
        imageDirectoryPath: this.imageGeneration.imageDirectoryPath,
      });
    }

    //adding subagent tool
    if (args.subagents) {
      this.subagents = args.subagents;

      const subagentTool = new SubAgentTool({
        subagents: this.subagents,
      });

      this.toolRegistry[subagentTool.name] = subagentTool;
    }
    if (args.mcpConfig) this.mcpConfig = args.mcpConfig;

    this.mcpClients = new Set();
    this.messages = [
      {
        role: "system",
        content: this.role,
      },
    ];

    //adding caller provided tools
    for (const localTool of Object.values(args.localTools)) {
      this.toolRegistry[localTool.name] = localTool;
    }
  }

  async loadMCPTools() {
    if (!this.mcpConfig) return;

    for (const mcpConfig of Object.values(this.mcpConfig)) {
      let transport: Transport | undefined;
      if (mcpConfig.transport === "stdio") {
        transport = new StdioClientTransport({
          command: mcpConfig.command,
          args: mcpConfig.arguments,
        });
      } else {
        const url = new URL(mcpConfig.url);
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: mcpConfig.headers,
          },
        }) as Transport;
      }

      const mcpClient = new Client({
        name: "my_app",
        version: "1.0.0",
      });

      await mcpClient.connect(transport);

      const { tools } = await mcpClient.listTools();

      for (const tool of tools) {
        const mcpTool = new MCPTool({
          name: tool.name,
          description: tool.description ?? "",
          mcpClient: mcpClient,
          definition: {
            type: "function",
            function: {
              name: tool.name,
              description: tool.description ?? "",
              parameters: tool.inputSchema,
            },
          },
        });
        this.toolRegistry[mcpTool.name] = mcpTool;
      }
      this.mcpClients.add(mcpClient);
    }
  }

  async closeMCPConnections() {
    await Promise.all(
      [...this.mcpClients].map(async (client) => client.close()),
    );

    this.mcpClients.clear();

    for (const tool of Object.values(this.toolRegistry)) {
      if (tool instanceof MCPTool) {
        delete this.toolRegistry[tool.name];
      }
    }
  }

  private getToolDefinitions() {
    return Object.values(this.toolRegistry).map((tool) => tool.definition);
  }

  private async streamCompletion() {
    const resquestStartedAt = performance.now();
    let firstTokenReceivedAt: number | undefined;
    const stream = await this.client.chat.completions.create({
      messages: this.messages,
      model: this.model,
      stream: true,
      tools: this.getToolDefinitions(),
      stream_options: {
        include_usage: true,
      },
    });

    let finalResponse = "";
    const toolCalls: Map<
      number,
      {
        type: "function";
        index: number;
        id: string;
        function: { name: string; arguments: string };
      }
    > = new Map();

    let usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      tps: 0,
      time_to_first_token_ms: 0,
      generation_duration_ms: 0,
    };

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage.prompt_tokens = chunk.usage.prompt_tokens;
        usage.completion_tokens = chunk.usage.completion_tokens;
        usage.total_tokens = chunk.usage.total_tokens;
      }
      const delta = chunk.choices[0]?.delta;

      if (
        firstTokenReceivedAt === undefined &&
        (delta?.content || delta?.tool_calls?.length)
      ) {
        firstTokenReceivedAt = performance.now();
      }

      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const cachedToolCall = toolCalls.get(toolCall.index);
          if (cachedToolCall) {
            cachedToolCall.function.arguments +=
              toolCall.function?.arguments ?? "";
          } else {
            toolCalls.set(toolCall.index, {
              type: "function",
              index: toolCall.index,
              id: toolCall.id ?? "",
              function: {
                name: toolCall.function?.name ?? "",
                arguments: toolCall.function?.arguments ?? "",
              },
            });
          }
        }
      }

      if (delta?.content) finalResponse += delta?.content;
    }
    const completionFinisedAt = performance.now();
    if (firstTokenReceivedAt !== undefined) {
      usage.time_to_first_token_ms = firstTokenReceivedAt - resquestStartedAt;
      usage.generation_duration_ms = completionFinisedAt - firstTokenReceivedAt;
      usage.tps =
        usage.generation_duration_ms > 0
          ? usage.completion_tokens / (usage.generation_duration_ms / 1000)
          : 0;
    }
    return { finalResponse, toolCalls, usage };
  }

  private async executeToolCalls(
    toolCalls: Map<
      number,
      {
        type: "function";
        index: number;
        id: string;
        function: { name: string; arguments: string };
      }
    >,
    superAgentUsage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      tps: number;
      time_to_first_token_ms: number;
    },
  ) {
    this.messages.push({
      role: "assistant",
      tool_calls: toolCalls.values().toArray(),
    });
    for (const toolCall of toolCalls.values()) {
      const tool = this.toolRegistry[toolCall.function.name];
      if (!tool) {
        this.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Tool with name: ${toolCall.function.name} does not exist`,
        });
        continue;
      }
      const parsedArgs = JSON.parse(toolCall.function.arguments);
      console.log(`Calling Tool: ${tool.name}${toolCall.function.arguments}`);
      const result = await tool.execute(parsedArgs);

      //@ts-ignore
      if (tool instanceof SubAgentTool && result instanceof Error === false) {
        superAgentUsage.completion_tokens += (
          result as any
        ).usage.completion_tokens;
        superAgentUsage.prompt_tokens += (result as any).usage.prompt_tokens;
        superAgentUsage.total_tokens += (result as any).usage.total_tokens;
      }

      this.messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content:
          result instanceof Error
            ? `Error: ${result.message}`
            : JSON.stringify(result),
      });
    }
  }

  async start({
    prompt,
    maxSteps = 30,
  }: {
    prompt: string;
    maxSteps?: number;
  }) {
    await this.loadMCPTools();

    this.messages.push({
      role: "user",
      content: prompt,
    });

    const usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      tps: 0,
      time_to_first_token_ms: 0,
    };

    let totalGenerationDurationMs = 0;

    for (let i = 0; i < maxSteps; i++) {
      const {
        finalResponse,
        toolCalls,
        usage: completionUsage,
      } = await this.streamCompletion();

      usage.prompt_tokens += completionUsage.prompt_tokens;
      ((usage.completion_tokens += completionUsage.completion_tokens),
        (usage.total_tokens += completionUsage.total_tokens));

      totalGenerationDurationMs += completionUsage.generation_duration_ms;

      if (i === 0) {
        usage.time_to_first_token_ms = completionUsage.time_to_first_token_ms;
      }

      usage.tps =
        totalGenerationDurationMs > 0
          ? usage.completion_tokens / (totalGenerationDurationMs / 1000)
          : 0;

      if (toolCalls.size > 0) {
        await this.executeToolCalls(toolCalls, usage);
      } else if (finalResponse) {
        this.messages.push({
          role: "assistant",
          content: finalResponse,
        });

        await this.closeMCPConnections();

        return { finalResponse, usage };
      }
    }
    throw new Error("Max steps exceeded.");
  }
}
