import { readFile, writeFile } from "node:fs/promises";
import type Embedder from "./embedder.ts";
import { Schema, Field, Utf8, FixedSizeList, Float32 } from "apache-arrow";
import { embedding } from "@lancedb/lancedb";
import * as lancedb from "@lancedb/lancedb";

type Database = {
  documents: {
    id: string;
    content: string;
    embedding: number[];
    source: string;
  }[];
};

export default abstract class VectorDatabase {
  embedder: Embedder;

  constructor(args: { embedder: Embedder }) {
    this.embedder = args.embedder;
  }

  abstract query(args: {
    queryContent: string;
    collectionId: "documents";
    limit: number;
  }): Promise<
    Error | { content: string; similarityScore: number; source: string }[]
  >;

  abstract insertMany(args: {
    collectionId: "documents";
    contents: {
      content: string;
      source: string;
    }[];
  }): Promise<Error | undefined>;
}

export class JSONVectorDatabase extends VectorDatabase {
  databasePath: string;

  constructor(args: { databasePath: string; embedder: Embedder }) {
    super({
      embedder: args.embedder,
    });

    this.databasePath = args.databasePath;
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
            source: item.source,
          };
        })
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, args.limit);
    } catch (error) {
      return error as Error;
    }
  }

  async insertMany(args: {
    collectionId: "documents";
    contents: {
      content: string;
      source: string;
    }[];
  }) {
    try {
      const databaseResult = await this.openDataBase();

      if (databaseResult instanceof Error) {
        throw databaseResult;
      }

      for (const { content, source } of args.contents) {
        const embeddingResult = await this.embedder.createEmbedding(content);

        if (embeddingResult instanceof Error) {
          console.error(embeddingResult);
          continue;
        }

        databaseResult[args.collectionId].push({
          id: crypto.randomUUID(),
          content,
          embedding: embeddingResult,
          source,
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

export class LanceDBVectorDatabase extends VectorDatabase {
  databasePath: string;

  constructor(args: { embedder: Embedder; databasePath: string }) {
    super({
      embedder: args.embedder,
    });

    this.databasePath = args.databasePath;
  }

  private async openTable(tableName: string) {
    const db = await lancedb.connect(this.databasePath);
    const EMBEDDING_DIM = 3072;

    const schema = new Schema([
      new Field("id", new Utf8(), false),
      new Field("content", new Utf8(), false),
      new Field("source", new Utf8(), false),

      new Field(
        "embedding",
        new FixedSizeList(
          EMBEDDING_DIM,
          new Field("item", new Float32(), true),
        ),
        false,
      ),
    ]);

    const tableNames = await db.listTables();

    let table: lancedb.Table;

    if (tableNames.tables.includes(tableName)) {
      table = await db.openTable(tableName);
    } else {
      table = await db.createEmptyTable(tableName, schema);
    }

    return table;
  }

  async query(args: {
    queryContent: string;
    collectionId: "documents";
    limit: number;
  }): Promise<
    Error | { content: string; similarityScore: number; source: string }[]
  > {
    try {
      const queryContentEmbeddingResult = await this.embedder.createEmbedding(
        args.queryContent,
      );

      if (queryContentEmbeddingResult instanceof Error) {
        throw queryContentEmbeddingResult;
      }

      const table = await this.openTable(args.collectionId);
      const candidates = await table
        .vectorSearch(queryContentEmbeddingResult)
        .column("embedding")
        .limit(args.limit)
        .toArray();

      return candidates.map((candidate) => ({
        content: candidate.content,
        source: candidate.source,
        similarityScore: 1 / (1 + candidate._distance),
      }));
    } catch (error) {
      return error as Error;
    }
  }

  async insertMany(args: {
    collectionId: "documents";
    contents: {
      content: string;
      source: string;
    }[];
  }): Promise<Error | undefined> {
    try {
      const table = await this.openTable(args.collectionId);

      //embed contents and insert into database
      const newEntries: {
        id: string;
        content: string;
        source: string;
        embedding: number[];
      }[] = [];

      for (const { content, source } of args.contents) {
        const embeddingResult = await this.embedder.createEmbedding(content);
        if (embeddingResult instanceof Error) {
          console.error(embeddingResult);
          continue;
        }

        newEntries.push({
          id: crypto.randomUUID(),
          content,
          source,
          embedding: embeddingResult,
        });

        await table.add(newEntries);
      }
    } catch (error) {
      return error as Error;
    }
  }
}
