export abstract class Voice {
  abstract generateTTS(text: string): Promise<Buffer | Error>;
}

const VOICE_BASE_URL = "http://localhost:17493";

export class Voicebox extends Voice {
  id: string;
  engine: string;
  modelSize: string;

  constructor(args: { id: string; engine: string; modelSize: string }) {
    super();
    this.id = args.id;
    this.engine = args.engine;
    this.modelSize = args.modelSize;
  }

  async generateTTS(text: string): Promise<Buffer | Error> {
    try {
      const res = await fetch(`${VOICE_BASE_URL}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          profile_id: this.id,
          text,
          language: "en",
          engine: this.engine,
          model_size: this.modelSize,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const generationRecord = (await res.json()) as {
        id: string;
        status?: string;
        error?: string;
      };

      while (true) {
        const res = await fetch(
          `${VOICE_BASE_URL}/history/${generationRecord.id}`,
        );

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const generation = (await res.json()) as {
          id: string;
          status?: string;
          error?: string;
        };

        if (generation.status === "failed") {
          throw new Error(generation.error ?? "TTS Failed for unknown reason");
        }

        if (generation.status === "completed") {
          break;
        }

        //wait 1 second
        await new Promise((res) => setTimeout(res, 1000));
      }
      const audioResponse = await fetch(
        `${VOICE_BASE_URL}/audio/${generationRecord.id}`,
      );

      if (!audioResponse.ok) {
        throw new Error(await audioResponse.text());
      }

      return Buffer.from(await audioResponse.arrayBuffer());
    } catch (error) {
      return error as Error;
    }
  }
}
