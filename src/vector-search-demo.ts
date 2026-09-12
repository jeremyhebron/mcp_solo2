// Vector / Embedding

// import "./env.ts";
// import OpenAI from "openai";
// import { readFile, writeFile } from "node:fs/promises";

// const vectorDatabase = new VectorDatabase({
//   databasePath: "vector_db.json",
//   embedder: new Embedder({
//     baseURL: "https://openrouter.ai/api/v1",
//     model: "openai/text-embedding-3-large",
//     apiKey: process.env.OPEN_ROUTER_API_KEY!,
//   }),
// });

// await vectorDatabase.insertMany({
//   collectionId: "documents",
//   contents: ["norwood 5 is a crazy nerf bruh"],
// });

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
