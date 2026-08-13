import type { Client } from "@modelcontextprotocol/sdk/client";
import type {
  ChatCompletionFunctionCallOption,
  ChatCompletionFunctionTool,
} from "openai/resources";
import type { z, ZodObject } from "zod";

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
