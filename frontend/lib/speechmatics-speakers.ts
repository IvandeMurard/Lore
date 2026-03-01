import { execSync } from "child_process";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

type WavPcm16 = {
  sampleRate: number;
  channels: number;
  durationSec: number;
  pcmData: Buffer;
};

export type EnrollmentErrorCode =
  | "ENROLL_AUDIO_TOO_SHORT"
  | "ENROLL_NO_SPEAKER_FOUND"
  | "ENROLL_UNKNOWN";

export class EnrollmentError extends Error {
  code: EnrollmentErrorCode;
  retryable: boolean;

  constructor(code: EnrollmentErrorCode, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = "EnrollmentError";
  }
}

async function convertToEnrollmentWavAsync(audioFile: File): Promise<File> {
  const id = `speaker-enroll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = join(tmpdir(), `${id}.input`);
  const outputPath = join(tmpdir(), `${id}.wav`);

  try {
    const inputBuffer = Buffer.from(await audioFile.arrayBuffer());
    writeFileSync(inputPath, inputBuffer);
    execSync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}"`, {
      timeout: 20000,
      stdio: "pipe",
    });
    const wavBuffer = readFileSync(outputPath);
    return new File([wavBuffer], "enrollment.wav", { type: "audio/wav" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EnrollmentError(
      "ENROLL_UNKNOWN",
      `Audio conversion failed for enrollment: ${message}`
    );
  } finally {
    try {
      unlinkSync(inputPath);
    } catch {
      // ignore cleanup errors
    }
    try {
      unlinkSync(outputPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function parseWavPcm16Async(file: File): Promise<WavPcm16> {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 44) {
    throw new EnrollmentError("ENROLL_UNKNOWN", "Invalid WAV file: too short.");
  }

  const riff = bytes.toString("ascii", 0, 4);
  const wave = bytes.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new EnrollmentError("ENROLL_UNKNOWN", "Invalid WAV file header.");
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt " && chunkDataStart + chunkSize <= bytes.length) {
      audioFormat = bytes.readUInt16LE(chunkDataStart);
      channels = bytes.readUInt16LE(chunkDataStart + 2);
      sampleRate = bytes.readUInt32LE(chunkDataStart + 4);
      bitsPerSample = bytes.readUInt16LE(chunkDataStart + 14);
    } else if (chunkId === "data" && chunkDataStart + chunkSize <= bytes.length) {
      dataOffset = chunkDataStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === -1 || dataSize <= 0) {
    throw new EnrollmentError("ENROLL_UNKNOWN", "Invalid WAV file: missing data chunk.");
  }
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new EnrollmentError("ENROLL_UNKNOWN", "Enrollment WAV must be PCM 16-bit.");
  }

  const pcmData = bytes.subarray(dataOffset, dataOffset + dataSize);
  const bytesPerSampleFrame = channels * (bitsPerSample / 8);
  const totalFrames = Math.floor(pcmData.length / bytesPerSampleFrame);
  const durationSec = totalFrames / sampleRate;

  return {
    sampleRate,
    channels,
    durationSec,
    pcmData,
  };
}

function estimateRmsPcm16Mono(pcmData: Buffer): number {
  if (pcmData.length < 2) return 0;
  let sumSquares = 0;
  let samples = 0;

  for (let i = 0; i + 1 < pcmData.length; i += 2) {
    const value = pcmData.readInt16LE(i) / 32768;
    sumSquares += value * value;
    samples += 1;
  }

  if (!samples) return 0;
  return Math.sqrt(sumSquares / samples);
}

export async function validateTeacherEnrollmentSample(audioFile: File): Promise<{
  sampleMeta: { duration_sec: number; sample_rate: number; channels: number };
}> {
  const wavFile = await convertToEnrollmentWavAsync(audioFile);
  const wav = await parseWavPcm16Async(wavFile);

  if (wav.durationSec < 5) {
    throw new EnrollmentError(
      "ENROLL_AUDIO_TOO_SHORT",
      `Enrollment sample is too short (${wav.durationSec.toFixed(2)}s). Provide at least 5 seconds.`
    );
  }

  const rms = estimateRmsPcm16Mono(wav.pcmData);
  if (rms < 0.004) {
    throw new EnrollmentError(
      "ENROLL_NO_SPEAKER_FOUND",
      "Enrollment sample appears too quiet or silent."
    );
  }

  return {
    sampleMeta: {
      duration_sec: Number(wav.durationSec.toFixed(2)),
      sample_rate: wav.sampleRate,
      channels: wav.channels,
    },
  };
}
