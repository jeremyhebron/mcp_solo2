import z from "zod";
import { LocalTool } from "../lib/tool.ts";

const getWeather = new LocalTool({
  name: "get_weather",
  description: "Fetches the weather",
  inputZodSchema: z.object({
    location: z.string(),
  }),
  outputZodSchema: z.object({
    temperature: z.string(),
  }),

  execute: async (input) => {
    return {
      temperature: "It is 1000 degrees",
    };
  },
});

export default getWeather;
