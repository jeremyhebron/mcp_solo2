import { writeFile } from "node:fs/promises";
import OpenAI from "openai";

// process.loadEnvFile();

export class ImageGenerationProvider {
  client: OpenAI;

  constructor(args: { baseURL: string; apiKey: string }) {
    this.client = new OpenAI({
      apiKey: args.apiKey,
      baseURL: args.baseURL,
    });
  }

  async generateImage(args: {
    prompt: string;
    model: string;
    size: "1024x1024" | "1536x1024" | "1024x1536";
  }) {
    const { data } = await this.client.images.generate({
      prompt: args.prompt,
      model: args.model,
      size: args.size,
    });

    const base64Data = data?.[0]?.b64_json;

    if (!base64Data) throw new Error("image data not returned from API");

    const bytes = Buffer.from(base64Data, "base64");

    return bytes;
  }
}
