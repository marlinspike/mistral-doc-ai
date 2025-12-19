import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import html2pdf from "html2pdf.js";

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 5;

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

type OcrResult = {
  id: string;
  filename: string;
  text?: string;
  markdown?: string;
  error?: string;
};

type ViewMode = "rendered" | "raw";

type ThemeMode = "light" | "dark";

const markdownPlugins = [remarkGfm, remarkBreaks];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, "");

const downloadMarkdown = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${stripExtension(filename)}.md`;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadPdf = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  await html2pdf()
    .set({
      margin: [0.5, 0.5],
      filename: `${stripExtension(filename)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    })
    .from(element)
    .save();
};

const toCombinedMarkdown = (results: OcrResult[]) =>
  results
    .map((result) => {
      const heading = `# ${result.filename}`;
      if (result.error) {
        return `${heading}\n\n**Error:** ${result.error}`;
      }
      const body = result.markdown || result.text || "";
      return `${heading}\n\n${body}`;
    })
    .join("\n\n---\n\n");

const App = () => {
  const [theme, setTheme] = useState<ThemeMode>(
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<OcrResult[]>([]);
  const [combineOutputs, setCombineOutputs] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("rendered");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const combinedMarkdown = useMemo(() => toCombinedMarkdown(results), [results]);

  const applyTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", nextTheme);
  };

  const addFiles = (incomingFiles: FileList | null) => {
    if (!incomingFiles) return;

    const nextFiles = [...files];
    const errors: string[] = [];

    Array.from(incomingFiles).forEach((file) => {
      if (nextFiles.length >= MAX_FILES) {
        errors.push(`Max ${MAX_FILES} files allowed.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errors.push(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }
      if (!/\.(pdf|png|jpg|jpeg)$/i.test(file.name)) {
        errors.push(`${file.name} is not a supported type.`);
        return;
      }
      nextFiles.push(file);
    });

    setFiles(nextFiles);
    setResults([]);
    setError(errors.length ? errors.join(" ") : null);
  };

  const removeFile = (index: number) => {
    const nextFiles = files.filter((_, idx) => idx !== index);
    setFiles(nextFiles);
  };

  const clearFiles = () => {
    setFiles([]);
    setResults([]);
    setError(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  };

  const runOcr = async () => {
    if (!files.length) return;
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch(`${API_BASE}/api/ocr`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "OCR request failed.");
      }

      const payload = await response.json();
      setResults(payload.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR request failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="max-w-6xl mx-auto px-6 pt-10 pb-6 flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Mistral Document AI
          </p>
          <div className="space-y-2">
            <h1 className="title-font text-4xl md:text-5xl">Doc AI Studio</h1>
            <p className="text-base text-[var(--muted)] max-w-xl">
              Upload handwritten pages or PDFs, extract clean text, and download results as
              Markdown or PDF.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass rounded-full px-4 py-2 text-xs text-[var(--muted)]">
            5MB max • 10 files
          </div>
          <button
            type="button"
            onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
            className="glass rounded-full px-4 py-2 text-sm font-semibold"
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-16 grid lg:grid-cols-[360px_1fr] gap-6">
        <section className="glass rounded-2xl p-6 flex flex-col gap-6">
          <div className="space-y-2">
            <h2 className="title-font text-xl">Upload</h2>
            <p className="text-sm text-[var(--muted)]">
              Drag and drop files or browse. Supported: PDF, JPG, PNG.
            </p>
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="border border-dashed border-[var(--border)] rounded-2xl p-6 text-center space-y-3"
          >
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(event) => addFiles(event.target.files)}
            />
            <label
              htmlFor="file-input"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-[var(--accent)] text-white text-sm font-semibold cursor-pointer"
            >
              Choose files
            </label>
            <p className="text-xs text-[var(--muted)]">
              Drop up to {MAX_FILES} files. Each must be under {MAX_FILE_SIZE_MB}MB.
            </p>
          </div>

          {files.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Queued files</p>
                <button
                  type="button"
                  onClick={clearFiles}
                  className="text-xs text-[var(--accent-2)] font-semibold"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold">{file.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatBytes(file.size)} • {file.type || "unknown"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-xs font-semibold text-[var(--accent)]"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">No files added yet.</p>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Combine outputs</span>
              <button
                type="button"
                onClick={() => setCombineOutputs((prev) => !prev)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                  combineOutputs ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
                aria-pressed={combineOutputs}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    combineOutputs ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={runOcr}
              disabled={!files.length || isProcessing}
              className="w-full rounded-full bg-[var(--accent-2)] text-white py-3 text-sm font-semibold disabled:opacity-50"
            >
              {isProcessing ? "Processing..." : "Run OCR"}
            </button>
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
          </div>
        </section>

        <section className="glass rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="title-font text-xl">Output</h2>
              <p className="text-sm text-[var(--muted)]">
                {results.length ? `${results.length} file(s) processed.` : "Awaiting OCR results."}
              </p>
            </div>
            <div className="inline-flex rounded-full border border-[var(--border)] overflow-hidden">
              {(["rendered", "raw"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                    viewMode === mode
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {!results.length ? (
            <div className="output-surface rounded-2xl p-8 text-center text-sm text-[var(--muted)]">
              OCR output will appear here. Combine results by default or switch to separate
              outputs.
            </div>
          ) : combineOutputs ? (
            <div className="space-y-4">
              <div className="output-surface rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      Combined
                    </p>
                    <h3 className="title-font text-2xl">All files</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadMarkdown(combinedMarkdown, "doc-ai-output")}
                      className="rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold"
                    >
                      Markdown
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPdf("pdf-combined", "doc-ai-output")}
                      className="rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold"
                    >
                      PDF
                    </button>
                  </div>
                </div>
                {viewMode === "rendered" ? (
                  <div className="prose prose-slate dark:prose-invert">
                    <ReactMarkdown remarkPlugins={markdownPlugins}>
                      {combinedMarkdown}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-[var(--text)]">
                    {combinedMarkdown}
                  </pre>
                )}
              </div>
              <div id="pdf-combined" className="print-surface">
                <div className="prose">
                  <ReactMarkdown remarkPlugins={markdownPlugins}>
                    {combinedMarkdown}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {results.map((result) => {
                const content = result.markdown || result.text || "";
                return (
                  <div key={result.id} className="output-surface rounded-2xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                          File
                        </p>
                        <h3 className="title-font text-2xl">{result.filename}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => downloadMarkdown(content, result.filename)}
                          className="rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold"
                        >
                          Markdown
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPdf(`pdf-${result.id}`, result.filename)}
                          className="rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold"
                        >
                          PDF
                        </button>
                      </div>
                    </div>

                    {result.error ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                        {result.error}
                      </div>
                    ) : viewMode === "rendered" ? (
                      <div className="prose prose-slate dark:prose-invert">
                        <ReactMarkdown remarkPlugins={markdownPlugins}>
                          {content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-[var(--text)]">
                        {content}
                      </pre>
                    )}

                    <div id={`pdf-${result.id}`} className="print-surface">
                      <div className="prose">
                        <ReactMarkdown remarkPlugins={markdownPlugins}>
                          {content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
