import Embedder from "../lib/embedder.ts";
import VectorDatabase from "../lib/vector_database.ts";

const vectorDatabase = new VectorDatabase({
  databasePath: "vector_database.json",
  embedder: new Embedder({
    model: "openai/text-embedding-3-large",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPEN_ROUTER_API_KEY!,
  }),
});

export default vectorDatabase;
