import { STT } from "../lib/stt.ts";

const whisper = new STT({
  model: "Whisper-Large-v3-Turbo",
  baseURL: "http://localhost:13305/v1",
});

export default whisper;
