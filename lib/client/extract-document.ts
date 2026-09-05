const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "csv", "json"]);

export type ExtractedDocument = {
  fileName: string;
  mimeType: string;
  base64: string;
  extractedText: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function normalizeText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim().slice(0, 220_000);
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  if (file.size > MAX_BYTES) throw new Error("أقصى حجم للملف 10 ميجابايت.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("النوع المسموح: PDF أو DOCX أو TXT أو MD أو CSV أو JSON.");
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let extractedText = "";

  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(text);
    }
    extractedText = pages.join("\f");
  } else if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer });
    extractedText = result.value;
  } else {
    extractedText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  extractedText = normalizeText(extractedText);
  if (!extractedText) throw new Error("الملف مفيهوش نص قابل للتحليل. جرّب نسخة قابلة للبحث.");
  const fallbackMime: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
  };
  return {
    fileName: file.name,
    mimeType: file.type || fallbackMime[extension] || "application/octet-stream",
    base64: toBase64(bytes),
    extractedText,
  };
}
