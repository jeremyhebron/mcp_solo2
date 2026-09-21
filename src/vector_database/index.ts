import Embedder from "../lib/embedder.ts";
import VectorDatabase, {
  LanceDBVectorDatabase,
} from "../lib/vector_database.ts";

const lanceDBVectorDatabase = new LanceDBVectorDatabase({
  databasePath: "data/lancedb",
  embedder: new Embedder({
    model: "openai/text-embedding-3-large",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPEN_ROUTER_API_KEY!,
  }),
});

export default lanceDBVectorDatabase;
