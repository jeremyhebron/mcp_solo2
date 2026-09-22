import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import {
  GenerateImageTool,
  LocalTool,
  MCPTool,
  SubAgentTool,
  type Tool,
} from "./tool.ts";
import { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ImageGenerationProvider } from "./image_generation_provider.ts";
import type { Voice } from "./voice.ts";
import os from "node:os";
import path from "node:path";
import { readFile, rm, writeFile } from "node:fs/promises";
import sound from "sound-play";
import type VectorDatabase from "./vector_database.ts";
import z from "zod";

const AGENT_CONFIG_PATH = "agent_config.json";

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

type AgentConfig = Record<
  string,
  {
    toolPolicy: Record<
      string,
      {
        alwaysAllow: boolean;
      }
    >;
  }
>;

type AskUserToolApprovalCallbackFn = (args: {
  name: string;
  args: string;
}) => Promise<"allow_once" | "always_allow" | "reject">;

type ToolCallsWithApprovals = Map<
  number,
  {
    type: "function";
    index: number;
    id: string;
    function: { name: string; arguments: string };
    approved: boolean;
  }
>;
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
  rag?: {
    vectorDatabase: VectorDatabase;
    vectorSearchLimit: number;
  };
  imageGeneration?: {
    provider: ImageGenerationProvider;
    model: string;
    imageDirectoryPath: string;
  };
  voice?: Voice;

  constructor(args: {
    id: string;
    role: string;
    client: OpenAI;
    model: string;
    localTools: Record<string, LocalTool<any, any>>;
    mcpConfig?: MCPConfig;
    rag?: {
      vectorDatabase: VectorDatabase;
      vectorSearchLimit: number;
    };
    subagents?: Record<string, Agent>;
    imageGeneration?: {
      provider: ImageGenerationProvider;
      model: string;
      imageDirectoryPath: string;
    };
    voice?: Voice;
  }) {
    this.id = args.id;
    this.toolRegistry = {};
    this.role = args.role;
    this.client = args.client;
    this.model = args.model;
    if (args.rag) this.rag = args.rag;
    if (args.voice) this.voice = args.voice;

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
        approved: boolean;
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
      tool_calls: toolCalls
        .values()
        .toArray()
        //filtering out approved field for llm
        .map((tc) => {
          return {
            type: "function",
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
            id: tc.id,
          };
        }),
    });
    for (const toolCall of toolCalls.values()) {
      if (!toolCall.approved) {
        this.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `User chose to refuse tool call.`,
        });

        continue;
      }
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

  loadUserSurveyTool(
    askUserSurvey: (survey: { question: string }[]) => Promise<
      {
        question: string;
        answer: string;
      }[]
    >,
  ) {
    this.toolRegistry["user_survey"] = new LocalTool({
      name: "user_survey",
      description:
        "Asks the user clarifying question disambiguate a vague prompt. Use when the prompt is vague and you need more information to proceed accurately.",
      inputZodSchema: z.object({
        survey: z.array(
          z.object({
            question: z.string(),
          }),
        ),
      }),
      outputZodSchema: z.object({
        finishedSurvey: z.array(
          z.object({
            question: z.string(),
            answer: z.string(),
          }),
        ),
      }),
      async execute(input) {
        const finishedSurvey = await askUserSurvey(input.survey);
        return {
          finishedSurvey,
        };
      },
    });
  }

  async loadConfig() {
    const initialAgentConfigState: AgentConfig = {
      [this.id]: {
        toolPolicy: {},
      },
    };

    try {
      const rawConfig = await readFile(AGENT_CONFIG_PATH, "utf-8");

      const config: AgentConfig = JSON.parse(rawConfig);

      //if the agent is not set in the config yet, set it
      if (this.id in config === false) {
        config[this.id] = {
          toolPolicy: {},
        };
        await writeFile(AGENT_CONFIG_PATH, JSON.stringify(config, null, 2));
      }

      return config;
    } catch (error) {
      //if the file doesnt exist on disk yet, create it
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await writeFile(
          AGENT_CONFIG_PATH,
          JSON.stringify(initialAgentConfigState, null, 2),
        );

        return structuredClone(initialAgentConfigState)!;
      }
      throw error;
    }
  }

  async saveConfig(config: AgentConfig) {
    await writeFile(AGENT_CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  async collectToolApprovals(
    askForToolCallApproval: AskUserToolApprovalCallbackFn,
    toolCallsWithApprovals: ToolCallsWithApprovals,
  ) {
    const config = await this.loadConfig();
    const agentConfig = config[this.id]!;
    for (const toolCall of toolCallsWithApprovals.values()) {
      const tool = this.toolRegistry[toolCall.function.name];

      if (!tool) continue;

      if (tool.requiresApproval) {
        const toolPolicy = agentConfig.toolPolicy[tool.name];

        if (!toolPolicy || !toolPolicy.alwaysAllow) {
          const approvalResult = await askForToolCallApproval({
            name: toolCall.function.name,
            args: toolCall.function.arguments,
          });
          if (!toolPolicy) {
            agentConfig.toolPolicy[tool.name] = {
              alwaysAllow: approvalResult === "always_allow" ? true : false,
            };
          } else {
            toolPolicy.alwaysAllow =
              approvalResult === "always_allow" ? true : false;
          }

          await this.saveConfig(config);

          toolCall.approved =
            approvalResult === "always_allow" ||
            approvalResult === "allow_once";
        }
      }
    }
  }

  async start({
    prompt,
    maxSteps = 30,
    askForToolCallApproval,
    askUserSurvey,
  }: {
    prompt: string;
    maxSteps?: number;
    askForToolCallApproval?: AskUserToolApprovalCallbackFn;
    askUserSurvey?: (survey: { question: string }[]) => Promise<
      {
        question: string;
        answer: string;
      }[]
    >;
  }) {
    await this.loadMCPTools();
    if (askUserSurvey) {
      this.loadUserSurveyTool(askUserSurvey);
    }

    this.messages.push({
      role: "user",
      content: prompt,
    });

    if (this.rag) {
      const candidates = await this.rag.vectorDatabase.query({
        collectionId: "documents",
        limit: this.rag.vectorSearchLimit,
        queryContent: prompt,
      });

      if (candidates instanceof Error) {
        console.error(candidates);
      } else {
        console.log(`Retrieved ${candidates.length} candidates`);
        console.log(candidates);
        const ragContent = ` The following content came back from a vector search against the vector database. If any of the content retrieved relevant to answering the prompt, please cite the sources in your response. VECTOR SEARCH CANDIDATES: ${candidates.map((candidate) => `Content: ${candidate.content} Source: ${candidate.source}`).join("\n")}`;
        this.messages.push({
          role: "system",
          content: ragContent,
        });
      }
    }

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

      const toolCallsWithApprovals: ToolCallsWithApprovals = new Map();
      for (const [key, toolCall] of toolCalls.entries()) {
        toolCallsWithApprovals.set(key, {
          ...toolCall,
          approved: true,
        });
      }

      if (toolCalls.size > 0) {
        if (askForToolCallApproval) {
          await this.collectToolApprovals(
            askForToolCallApproval,
            toolCallsWithApprovals,
          );
        }

        await this.executeToolCalls(toolCallsWithApprovals, usage);
      } else if (finalResponse) {
        this.messages.push({
          role: "assistant",
          content: finalResponse,
        });

        if (this.voice) {
          console.log("Generating TTS...");
          const audioBuffer = await this.voice.generateTTS(finalResponse);

          if (audioBuffer instanceof Error) {
            console.error(audioBuffer.message);

            return {
              finalResponse,
              usage,
            };
          }

          const tempFilePath = path.join(os.tmpdir(), crypto.randomUUID());

          await writeFile(tempFilePath, audioBuffer);

          await sound.play(tempFilePath);

          await rm(tempFilePath);
        }

        await this.closeMCPConnections();

        return { finalResponse, usage };
      }
    }
    throw new Error("Max steps exceeded.");
  }
}
