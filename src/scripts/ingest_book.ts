import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import VectorDatabase from "../lib/vector_database.ts";
import Embedder from "../lib/embedder.ts";
import "../env.ts";
import lanceDBVectorDatabase from "../vector_database/index.ts";
import path from "node:path";

const buffer = await readFile("sources/blockchain_chicken_farm.pdf");

const parser = new PDFParse({ data: buffer });

const result = await parser.getText();

console.log(`Total pages: ${result.total}---`);

const paragraphs = result.text
  .split(/\n\s*\n/)
  .map((p) => p.trim())
  .filter((p) => p.length > 0);

// const vectorDatabase = new VectorDatabase({
//   databasePath: "vector_database.json",
//   embedder: new Embedder({
//     model: "openai/text-embedding-3-large",
//     baseURL: "https://openrouter.ai/api/v1",
//     apiKey: process.env.OPEN_ROUTER_API_KEY!,
//   }),
// });

// await vectorDatabase.insertMany({
//   collectionId: "documents",
//   contents: paragraphs,
// });

await lanceDBVectorDatabase.insertMany({
  collectionId: "documents",
  contents: paragraphs.map((p) => ({
    content: p,
    source: path.resolve("sources/blockchain_chicken_farm.pdf"),
  })),
});
