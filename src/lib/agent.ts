import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import type { LocalTool, Tool } from "./tool.ts";

export class Agent {
  id: string;
  role: string;
  messages: ChatCompletionMessageParam[];
  client: OpenAI;
  model: string;
  toolRegistry: Record<string, Tool>;

  constructor(args: {
    id: string;
    role: string;
    client: OpenAI;
    model: string;
    localTools: Record<string, LocalTool<any, any>>;
  }) {
    this.id = args.id;
    this.role = args.role;
    this.client = args.client;
    this.model = args.model;
    this.toolRegistry = {};
    for (const localTool of Object.values(args.localTools)) {
      this.toolRegistry[localTool.name] = localTool;
    }
    this.messages = [
      {
        role: "system",
        content: this.role,
      },
    ];
  }

  private getToolDefinitions() {
    return Object.values(this.toolRegistry).map((tool) => tool.definition);
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
          content: `Tool with name: ${toolCall.function.name} does not exist in Tool Registry`,
        });
        continue;
      }
      const parsedArgs = JSON.parse(toolCall.function.arguments);

      const result = await tool.execute(parsedArgs);
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

  private async streamCompletion() {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      stream: true,
      tools: this.getToolDefinitions(),
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

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
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
      if (delta?.content) finalResponse += delta.content;
    }
    if (toolCalls.size > 0) console.log(toolCalls);
    return { finalResponse, toolCalls };
  }

  async start({
    prompt,
    maxSteps = 10,
  }: {
    prompt: string;
    maxSteps?: number;
  }) {
    this.messages.push({
      role: "user",
      content: prompt,
    });

    for (let i = 0; i < maxSteps; i++) {
      const { finalResponse, toolCalls } = await this.streamCompletion();

      if (toolCalls.size > 0) {
        //execute tools
        await this.executeToolCalls(toolCalls);
      } else if (finalResponse) {
        this.messages.push({
          role: "assistant",
          content: finalResponse,
        });

        return finalResponse;
      }
    }
  }
}
