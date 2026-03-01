"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";

export interface OrgConfig {
  orgName: string;
  industry: string;
  assetId: string;
  sopTitle: string;
  sopContent: string;
  expertName: string;
  expertRole: string;
  expertYears: string;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  text: string | null; // null = binary / not yet extracted
}

interface SetupScreenProps {
  onComplete: (config: OrgConfig) => void;
}

const STEPS = ["Organization", "SOP Documents", "Expert Profile"] as const;

const DEMO_CONFIG: OrgConfig = {
  orgName: "Air France Industries",
  industry: "Aviation MRO",
  assetId: "F-GKXA",
  sopTitle: "CFM56-5B Engine Maintenance Manual",
  sopContent: "",
  expertName: "Marc Delaunay",
  expertRole: "Senior CFM56 Engine Engineer",
  expertYears: "26",
};

const ACCEPTED_TYPES = ["application/pdf", "text/plain", "text/markdown", "text/x-markdown"];
const ACCEPTED_EXT = [".pdf", ".txt", ".md"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "utf-8");
  });
}

async function extractFileContent(file: File): Promise<string | null> {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-pdf", { method: "POST", body: formData });
      if (!res.ok) return null;
      const { text } = await res.json() as { text: string };
      return text ?? null;
    } catch {
      return null;
    }
  }
  // Plain text / markdown
  try {
    return await readFileAsText(file);
  } catch {
    return null;
  }
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [config, setConfig] = useState<OrgConfig>({
    orgName: "",
    industry: "",
    assetId: "",
    sopTitle: "",
    sopContent: "",
    expertName: "",
    expertRole: "",
    expertYears: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (key: keyof OrgConfig, value: string) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const accepted = list.filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return ACCEPTED_TYPES.includes(f.type) || ACCEPTED_EXT.includes(ext);
    });
    if (!accepted.length) return;

    const results = await Promise.all(
      accepted.map(async (f) => {
        const text = await extractFileContent(f);
        return { name: f.name, size: f.size, type: f.type, text } satisfies UploadedFile;
      })
    );

    setUploadedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...results.filter((r) => !existing.has(r.name))];
    });

    // Auto-populate title from first file if not set
    const firstPdf = results.find((r) => r.name.endsWith(".pdf"));
    if (firstPdf) {
      setConfig((prev) => ({
        ...prev,
        sopTitle:
          prev.sopTitle ||
          firstPdf.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "),
      }));
    }

    // Append extracted text to SOP content
    const extractedTexts = results
      .filter((r) => r.text && r.text.trim())
      .map((r) => `--- ${r.name} ---\n${r.text!.trim()}`);
    if (extractedTexts.length) {
      setConfig((prev) => ({
        ...prev,
        sopContent: [prev.sopContent, ...extractedTexts]
          .filter(Boolean)
          .join("\n\n"),
      }));
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      void processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const removeFile = (name: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const canProceed = () => {
    if (step === 0) return config.orgName.trim() !== "" && config.assetId.trim() !== "";
    if (step === 1) return true;
    if (step === 2) return config.expertName.trim() !== "";
    return false;
  };

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      const setupPayload = config;
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupPayload),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: string };
        console.warn(
          "[setup] provisioning failed:",
          payload.error || response.statusText,
          payload.details || ""
        );
      }
      onComplete(setupPayload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoadDemoPreset = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DEMO_CONFIG),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: string };
        console.warn(
          "[setup] demo provisioning failed:",
          payload.error || response.statusText,
          payload.details || ""
        );
      }
      onComplete(DEMO_CONFIG);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "rounded-md border border-border bg-card/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring w-full";

  return (
    <main className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Lore</h1>
        <span className="text-xs text-muted-foreground">Workspace setup</span>
      </header>

      <div className="flex-1 container max-w-xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Progress */}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? "bg-foreground" : "bg-border"
              }`}
            />
          ))}
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-xl font-semibold">{STEPS[step]}</h2>
        </div>

        {/* Step 0 — Organization */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Tell Lore about your organization so it can attribute knowledge and link it to the right assets.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Organization name</label>
              <input
                className={inputClass}
                placeholder="e.g. Air France Industries"
                value={config.orgName}
                onChange={(e) => update("orgName", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Industry{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <select
                className={inputClass}
                value={config.industry}
                onChange={(e) => update("industry", e.target.value)}
              >
                <option value="">Select an industry</option>
                <option value="Aviation MRO">Aviation MRO</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Energy & Utilities">Energy &amp; Utilities</option>
                <option value="Oil & Gas">Oil &amp; Gas</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Construction">Construction</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Asset identifier</label>
              <p className="text-xs text-muted-foreground">
                Tail number, machine ID, unit ID — the primary asset Lore will track.
              </p>
              <input
                className={`${inputClass} font-mono`}
                placeholder="e.g. F-GKXA"
                value={config.assetId}
                onChange={(e) => update("assetId", e.target.value.toUpperCase())}
              />
            </div>
          </div>
        )}

        {/* Step 1 — SOP */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Add your standard operating procedures. Lore treats SOPs as the highest-priority reference — they always override oral knowledge.
            </p>

            {/* Drop zone */}
            <div
              className={`relative rounded-lg border-2 border-dashed transition-colors duration-150 ${
                isDragOver
                  ? "border-foreground bg-foreground/5"
                  : "border-border bg-card/40 hover:border-muted-foreground/50"
              }`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                multiple
                className="sr-only"
                onChange={(e) => e.target.files && void processFiles(e.target.files)}
              />
              <button
                type="button"
                className="w-full px-6 py-8 flex flex-col items-center gap-2 text-center cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {/* Upload icon */}
                <svg
                  className={`w-8 h-8 transition-colors ${isDragOver ? "text-foreground" : "text-muted-foreground"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <span className="text-sm font-medium">
                  {isDragOver ? "Drop files here" : "Drop files or click to browse"}
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, TXT, MD — text will be extracted automatically
                </span>
              </button>
            </div>

            {/* Uploaded files */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                {uploadedFiles.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-2"
                  >
                    {/* File type icon */}
                    <svg
                      className="w-5 h-5 shrink-0 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                        {f.text === null
                          ? " · binary"
                          : f.text === ""
                          ? " · no text extracted"
                          : ` · ${f.text.split(/\s+/).length.toLocaleString()} words extracted`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => removeFile(f.name)}
                      aria-label={`Remove ${f.name}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                SOP title{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                className={inputClass}
                placeholder="e.g. CFM56-5B Engine Maintenance Manual"
                value={config.sopTitle}
                onChange={(e) => update("sopTitle", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Extracted / manual content
                <span className="text-muted-foreground font-normal"> (editable)</span>
              </label>
              <textarea
                className={`${inputClass} min-h-[140px] resize-y font-mono text-xs`}
                placeholder="Content extracted from uploaded files will appear here. You can also paste directly."
                value={config.sopContent}
                onChange={(e) => update("sopContent", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 2 — Expert */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Configure the senior expert whose tacit knowledge Lore will capture, attribute, and make available to your team.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Expert full name</label>
              <input
                className={inputClass}
                placeholder="e.g. Marc Delaunay"
                value={config.expertName}
                onChange={(e) => update("expertName", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Role / title{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                className={inputClass}
                placeholder="e.g. Senior CFM56 Engine Engineer"
                value={config.expertRole}
                onChange={(e) => update("expertRole", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Years of experience{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                max="60"
                className={`${inputClass} w-28`}
                placeholder="26"
                value={config.expertYears}
                onChange={(e) => update("expertYears", e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSubmitting}
            onClick={() => {
              void handleLoadDemoPreset();
            }}
          >
            Load demo preset
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              disabled={!canProceed() || isSubmitting}
              onClick={handleNext}
            >
              {step === STEPS.length - 1
                ? isSubmitting
                  ? "Setting up…"
                  : "Launch Lore"
                : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
