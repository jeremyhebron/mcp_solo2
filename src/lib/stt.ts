import Microphone from "node-microphone";
import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import type { Interface } from "node:readline/promises";
import OpenAI from "openai";

export class STT {
  model: string;
  client: OpenAI;

  constructor(args: { baseURL: string; apiKey?: string; model: string }) {
    this.client = new OpenAI({
      baseURL: args.baseURL,
      apiKey: args.apiKey ?? "no-key",
    });
    this.model = args.model;
  }
  async openMicAndTranscribe(rl: Interface) {
    const mic = new Microphone({
      rate: "16000",
      channels: 1,
      fileType: "wav",
    });

    const fileStream = createWriteStream("output.wav");

    const micStream = mic.startRecording();

    if (micStream) {
      micStream.pipe(fileStream);
    }

    await rl.question("Recording... press Enter to stop");

    mic.stopRecording();
    await new Promise((res) => fileStream.end(res));

    const response = await this.client.audio.transcriptions.create({
      file: createReadStream("output.wav"),
      model: this.model,
    });

    await rm("output.wav");

    return response.text.trim();
  }
}
