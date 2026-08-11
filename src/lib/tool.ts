import type { ChatCompletionFunctionTool } from "openai/resources";
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
