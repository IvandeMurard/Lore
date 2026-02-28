const DEFAULT_BASE_URL = "https://asr.api.speechmatics.com";
const DEFAULT_LANGUAGE = "en";

interface SpeechmaticsCreateJobResponse {
  id?: string;
  job?: { id?: string };
}

interface SpeechmaticsJobResponse {
  status?: string;
  job?: {
    status?: string;
  };
}

function getApiKey(): string {
  const key = process.env.SPEECHMATICS_API_KEY;
  if (!key) {
    throw new Error("Missing SPEECHMATICS_API_KEY.");
  }
  return key;
}

function getCandidateBaseUrls(): string[] {
  const configured = (process.env.SPEECHMATICS_ASR_BASE_URL ?? "").trim();
  const candidates = [
    configured,
    "https://eu.asr.api.speechmatics.com",
    "https://eu1.asr.api.speechmatics.com",
    "https://eu2.asr.api.speechmatics.com",
    "https://trial.asr.api.speechmatics.com",
    "https://asr.api.speechmatics.com",
    "https://us.asr.api.speechmatics.com",
    "https://us1.asr.api.speechmatics.com",
    "https://us2.asr.api.speechmatics.com",
    "https://au1.asr.api.speechmatics.com",
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeJobStatus(status: string | undefined): string {
  return (status ?? "").toLowerCase();
}

async function createTranscriptionJob(
  audioFile: File,
  language: string
): Promise<{ jobId: string; baseUrl: string }> {
  const apiKey = getApiKey();
  const endpointErrors: string[] = [];

  for (const baseUrl of getCandidateBaseUrls()) {
    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({
        type: "transcription",
        transcription_config: {
          language: language || DEFAULT_LANGUAGE,
          operating_point: "enhanced",
        },
      })
    );
    formData.append("data_file", audioFile, audioFile.name || "audio.webm");

    const response = await fetch(`${baseUrl}/v2/jobs/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      cache: "no-store",
    });

    if (response.ok) {
      const payload = (await response.json()) as SpeechmaticsCreateJobResponse;
      const id = payload.id ?? payload.job?.id;
      if (!id) {
        throw new Error("Speechmatics response missing job id.");
      }
      return { jobId: id, baseUrl };
    }

    const body = await response.text();
    endpointErrors.push(`${baseUrl} -> ${response.status}`);

    // For auth/region-type failures, continue and try other valid endpoints.
    if (response.status === 401 || response.status === 403) {
      continue;
    }

    throw new Error(`Speechmatics job creation failed (${response.status}): ${body}`);
  }

  throw new Error(
    `Speechmatics authorization failed for all endpoints (${endpointErrors.join(", ")}). ` +
      "Check that your API key is valid/not expired, enabled for Batch jobs, and tied to the correct region or trial endpoint."
  );
}

async function waitForJobCompletion(jobId: string, baseUrl: string): Promise<void> {
  const apiKey = getApiKey();
  const startedAt = Date.now();
  const timeoutMs = 90_000;
  const pollMs = 1_000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/v2/jobs/${jobId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Speechmatics job status failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as SpeechmaticsJobResponse;
    const status = normalizeJobStatus(payload.job?.status ?? payload.status);
    if (status === "done") return;
    if (["rejected", "failed", "error", "expired", "deleted"].includes(status)) {
      throw new Error(`Speechmatics transcription failed with status: ${status}`);
    }

    await delay(pollMs);
  }

  throw new Error("Speechmatics transcription timed out.");
}

async function fetchTranscript(jobId: string, baseUrl: string): Promise<string> {
  const apiKey = getApiKey();
  const response = await fetch(`${baseUrl}/v2/jobs/${jobId}/transcript?format=txt`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Speechmatics transcript fetch failed (${response.status}): ${body}`);
  }

  return (await response.text()).trim();
}

async function deleteJob(jobId: string, baseUrl: string): Promise<void> {
  const apiKey = getApiKey();
  await fetch(`${baseUrl}/v2/jobs/${jobId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
}

export async function transcribeWithSpeechmatics(
  audioFile: File,
  language = DEFAULT_LANGUAGE
): Promise<string> {
  const { jobId, baseUrl } = await createTranscriptionJob(audioFile, language);
  try {
    await waitForJobCompletion(jobId, baseUrl);
    return await fetchTranscript(jobId, baseUrl);
  } finally {
    void deleteJob(jobId, baseUrl);
  }
}
