// Vector / Embedding

import "./env.ts";
import OpenAI from "openai";

import { readFile, writeFile } from "node:fs/promises";

class Embedder {
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

type Database = {
  documents: {
    id: string;
    content: string;
    embedding: number[];
  }[];
};

class VectorDatabase {
  databasePath: string;
  embedder: Embedder;

  constructor(args: { databasePath: string; embedder: Embedder }) {
    this.databasePath = args.databasePath;
    this.embedder = args.embedder;
  }

  private async openDataBase(): Promise<Database | Error> {
    const defaultDatabseState = {
      documents: [],
    };

    try {
      const rawData = await readFile(this.databasePath, "utf-8");

      const database: Database = JSON.parse(rawData);

      return database;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await writeFile(
          this.databasePath,
          JSON.stringify(defaultDatabseState, null, 2),
        );
        return defaultDatabseState;
      }
      return error as Error;
    }
  }

  async query(args: {
    queryContent: string;
    collectionId: "documents";
    limit: number;
  }) {
    try {
      const databaseResult = await this.openDataBase();

      if (databaseResult instanceof Error) {
        throw databaseResult;
      }

      const embeddingResult = await this.embedder.createEmbedding(
        args.queryContent,
      );

      if (embeddingResult instanceof Error) {
        throw embeddingResult;
      }

      const collection = databaseResult[args.collectionId];

      return collection
        .map((item) => {
          const similarityScore = this.cosineSimilarity(
            embeddingResult,
            item.embedding,
          );

          return {
            content: item.content,
            similarityScore,
          };
        })
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, args.limit);
    } catch (error) {
      return error as Error;
    }
  }

  async insertMany(args: { collectionId: "documents"; contents: string[] }) {
    try {
      const databaseResult = await this.openDataBase();

      if (databaseResult instanceof Error) {
        throw databaseResult;
      }

      for (const content of args.contents) {
        const embeddingResult = await this.embedder.createEmbedding(content);

        if (embeddingResult instanceof Error) {
          console.error(embeddingResult);
          continue;
        }

        databaseResult[args.collectionId].push({
          id: crypto.randomUUID(),
          content,
          embedding: embeddingResult,
        });
      }

      await writeFile(
        this.databasePath,
        JSON.stringify(databaseResult, null, 2),
      );
    } catch (error) {
      return error as Error;
    }
  }

  private cosineSimilarity(
    a: readonly number[] | Float32Array,
    b: readonly number[] | Float32Array,
  ): number {
    if (a.length !== b.length) {
      throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      //@ts-ignore
      dot += a[i] * b[i];
      //@ts-ignore
      normA += a[i] * a[i];
      //@ts-ignore
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

const vectorDatabase = new VectorDatabase({
  databasePath: "vector_db.json",
  embedder: new Embedder({
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/text-embedding-3-large",
    apiKey: process.env.OPEN_ROUTER_API_KEY!,
  }),
});

await vectorDatabase.insertMany({
  collectionId: "documents",
  contents: ["norwood 5 is a crazy nerf bruh"],
});

// const candidates = await vectorDatabase.query({
//   collectionId: "documents",
//   limit: 3,
//   queryContent: "how do LLMs work?",
// });

// console.log(candidates);

// await vectorDatabase.insertMany({
//   collectionId: "documents",
//   contents: [
//     "yo wassup bruh",
//     "this is a long sentence about LLms or some shit",
//   ],
// });

// const client = new OpenAI({
//   baseURL: "https://openrouter.ai/api/v1",
//   apiKey: process.env.OPEN_ROUTER_API_KEY,
// });

// for (const doc of database.documents) {
//   const response = await client.embeddings.create({
//     model: "text-embedding-3-large",
//     input: doc.content,
//   });

//   const embedding = response.data[0]?.embedding;
//   //@ts-ignore
//   doc.embedding = embedding;
// }

// await writeFile("vector_db.json", JSON.stringify(database, null, 2));

//////

// const response = await client.embeddings.create({
//   model: "openai/text-embedding-3-large",
//   input: PROMPT,
// });

// const promptEmbedding = response.data[0]?.embedding;

// const docsWithEmbeddings = [];

// for (const doc of docs) {
//   const response = await client.embeddings.create({
//     model: "openai/text-embedding-3-large",
//     input: doc,
//   });

//   const docEmbedding = response.data[0]?.embedding;

//   docsWithEmbeddings.push({
//     doc,
//     embedding: docEmbedding,
//   });
// }

// const candidates = docsWithEmbeddings
//   .map((doc) => {
//     const similarityScore = cosineSimilarity(promptEmbedding!, doc.embedding!);

//     return {
//       content: doc.doc,
//       similarityScore,
//     };
//   })
//   .sort((a, b) => b.similarityScore - a.similarityScore);

// console.log(candidates);

// function cosineSimilarity(
//   a: readonly number[] | Float32Array,
//   b: readonly number[] | Float32Array,
// ): number {
//   if (a.length !== b.length) {
//     throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
//   }
//   let dot = 0;
//   let normA = 0;
//   let normB = 0;
//   for (let i = 0; i < a.length; i++) {
//     //@ts-ignore
//     dot += a[i] * b[i];
//     //@ts-ignore
//     normA += a[i] * a[i];
//     //@ts-ignore
//     normB += b[i] * b[i];
//   }
//   const denom = Math.sqrt(normA) * Math.sqrt(normB);
//   return denom === 0 ? 0 : dot / denom;
// }
