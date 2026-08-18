import type { Client } from "@modelcontextprotocol/sdk/client";
import type { ChatCompletionFunctionTool } from "openai/resources";
import { z, type ZodObject } from "zod";
import type { Agent } from "./agent.ts";

export abstract class Tool {
  name: string;
  description: string;
  definition: ChatCompletionFunctionTool;

  constructor(args: { name: string; description: string }) {
    this.name = args.name;
    this.description = args.description;
    this.definition = {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
      },
    };
  }
  abstract execute(input: unknown): Promise<unknown | Error>;
}

export class LocalTool<
  InputZodSchema extends ZodObject,
  OutputZodSchema extends ZodObject,
> extends Tool {
  inputZodSchema: InputZodSchema;
  outputZodScehma: OutputZodSchema;
  _execute: (
    input: z.infer<InputZodSchema>,
  ) => Promise<z.infer<OutputZodSchema>>;

  constructor(args: {
    name: string;
    description: string;
    inputZodSchema: InputZodSchema;
    outputZodSchema: OutputZodSchema;
    execute: (
      input: z.infer<InputZodSchema>,
    ) => Promise<z.infer<OutputZodSchema>>;
  }) {
    super({
      name: args.name,
      description: args.description,
    });
    this.inputZodSchema = args.inputZodSchema;
    this.outputZodScehma = args.outputZodSchema;
    this._execute = args.execute;
    this.definition.function.parameters = this.inputZodSchema.toJSONSchema();
  }

  async execute(input: z.infer<InputZodSchema>) {
    try {
      return await this._execute(input);
    } catch (error) {
      return error as Error;
    }
  }
}

export class MCPTool extends Tool {
  mcpClient: Client;

  constructor(args: {
    name: string;
    description: string;
    mcpClient: Client;
    definition: ChatCompletionFunctionTool;
  }) {
    super({
      name: args.name,
      description: args.description,
    });
    this.definition = args.definition;
    this.mcpClient = args.mcpClient;
  }
  async execute(input: Record<string, unknown>): Promise<unknown | Error> {
    try {
      return await this.mcpClient.callTool({
        name: this.name,
        arguments: input,
      });
    } catch (error) {
      return error as Error;
    }
  }
}

export class SubAgentTool extends Tool {
  subagents: Record<string, Agent>;

  constructor(args: { subagents: Record<string, Agent> }) {
    const subagentDescription = Object.values(args.subagents)
      .map(
        (subagent) =>
          `Agent ID: ${subagent.id}, Role: ${subagent.role.slice(0, 200)}`,
      )
      .join("\n");

    super({
      name: "subagent_tool",
      description: `Use this tool to delegate a task to a specialist agent. the subagents are as follows: ${subagentDescription}`,
    });
    this.subagents = args.subagents;
    const agentIds = Object.values(this.subagents).map(
      (subagent) => subagent.id,
    );
    this.definition.function.parameters = z
      .object({
        agentId: z.enum(agentIds),
        prompt: z.string(),
      })
      .toJSONSchema();
  }

  async execute(input: { agentId: string; prompt: string }): Promise<
    | {
        finalResponse: string;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          tps: number;
          time_to_first_token_ms: number;
        };
      }
    | Error
  > {
    try {
      const subagent = Object.values(this.subagents).find(
        (subagent) => subagent.id === input.agentId,
      );
      if (!subagent) {
        throw new Error(`Subagent with ID ${input.agentId} does not exist.`);
      }

      console.log(`Calling Subagent: ${subagent.id}`);
      const { finalResponse, usage } = await subagent.start({
        prompt: input.prompt,
      });

      console.log(`Subagent: ${finalResponse}`);

      return { finalResponse, usage };
    } catch (error) {
      return error as Error;
    }
  }
}
