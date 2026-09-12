import OpenAI from "openai";

export default class Embedder {
  model: string;
  client: OpenAI;

  constructor(args: { model: string; baseURL: string; apiKey?: string }) {
    this.model = args.model;
    this.client = new OpenAI({
      baseURL: args.baseURL,
      apiKey: args.apiKey ?? "no-key",
    });
  }
  async createEmbedding(content: string): Promise<number[] | Error> {
    try {
      const response = await this.client.embeddings.create({
        model: "text-embedding-3-large",
        input: content,
      });

      const embedding = response.data[0]?.embedding;

      if (!embedding)
        throw new Error(
          `API didnt not return an embedding for content: ${content}`,
        );

      return embedding;
    } catch (error) {
      return error as Error;
    }
  }
}
