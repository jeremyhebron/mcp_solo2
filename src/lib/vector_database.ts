import { readFile, writeFile } from "node:fs/promises";
import type Embedder from "./embedder.ts";

type Database = {
  documents: {
    id: string;
    content: string;
    embedding: number[];
  }[];
};

export default class VectorDatabase {
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
