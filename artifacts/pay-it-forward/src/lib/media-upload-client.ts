import { authHeaders } from "@/lib/auth";

export type BinaryUploadDescriptor = {
  method: string;
  url: string;
  headers: Record<string, string>;
};

export type ResumableUploadDescriptor = {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
  chunkSize: number;
};

export type BinaryUploadErrorMessages = {
  method: string;
  invalidUrl: string;
  failed: string;
  network: string;
  timeout: string;
};

const DEFAULT_UPLOAD_ERRORS: BinaryUploadErrorMessages = {
  method: "The media service did not provide a PUT upload.",
  invalidUrl: "The media service returned an invalid upload URL.",
  failed: "Media bytes could not be uploaded. Check your connection and retry.",
  network: "Storage upload failed. Check your connection and retry.",
  timeout: "Storage upload timed out. You can retry.",
};

/**
 * Resolve API-provided completion endpoints without allowing a request to
 * escape the current origin or carry embedded credentials/fragments.
 */
export function ensureSameOriginMediaPath(
  path: string,
  makeError: (message: string) => Error = (message) => new Error(message),
): string {
  let url: URL;
  try {
    url = new URL(path, window.location.origin);
  } catch {
    throw makeError("The media service returned an unsafe Niakofa endpoint.");
  }
  if (url.origin !== window.location.origin || url.username || url.password || url.hash) {
    throw makeError("The media service returned an unsafe Niakofa endpoint.");
  }
  return `${url.pathname}${url.search}`;
}

/**
 * Send media as a raw File/Blob with XHR so callers retain upload progress,
 * cancellation, and the long-running storage-upload timeout.
 */
export function uploadBinaryMedia(input: {
  upload: BinaryUploadDescriptor;
  file: File;
  signal: AbortSignal;
  onProgress: (loaded: number, total: number) => void;
  errors?: BinaryUploadErrorMessages;
  makeError?: (message: string, status?: number) => Error;
}): Promise<void> {
  const {
    upload,
    file,
    signal,
    onProgress,
    errors = DEFAULT_UPLOAD_ERRORS,
    makeError = (message) => new Error(message),
  } = input;
  if (upload.method !== "PUT") return Promise.reject(makeError(errors.method));

  let url: URL;
  try {
    url = new URL(upload.url, window.location.origin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch {
    return Promise.reject(makeError(errors.invalidUrl));
  }

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Upload cancelled.", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.timeout = 180_000;
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      xhr.upload.onprogress = null;
      xhr.onload = null;
      xhr.onerror = null;
      xhr.ontimeout = null;
      xhr.onabort = null;
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => xhr.abort();

    xhr.open("PUT", url.href);
    const headers = { ...upload.headers };
    if (url.origin === window.location.origin) {
      for (const [name, value] of Object.entries(authHeaders())) {
        if (!Object.keys(headers).some((existing) => existing.toLowerCase() === name.toLowerCase())) {
          headers[name] = value;
        }
      }
    }
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish(resolve);
      else finish(() => reject(makeError(errors.failed, xhr.status)));
    };
    xhr.onerror = () => finish(() => reject(makeError(errors.network)));
    xhr.ontimeout = () => finish(() => reject(makeError(errors.timeout)));
    xhr.onabort = () => finish(() => reject(new DOMException("Upload cancelled.", "AbortError")));
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}

function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) return Promise.reject(new Error("Secure chunk checksums are unavailable in this browser."));
  return globalThis.crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));
}

/**
 * Upload a file as bounded, checksummed chunks. Progress is based on the
 * in-flight chunk but remains below completion until the server acknowledges
 * every byte and the caller confirms the completion endpoint.
 */
export async function uploadResumableMedia(input: {
  upload: ResumableUploadDescriptor;
  file: File;
  initialOffset: number;
  signal: AbortSignal;
  onProgress: (loaded: number, total: number) => void;
  onConfirmedOffset?: (offset: number) => void | Promise<void>;
  maxRetries?: number;
  makeError?: (message: string, status?: number) => Error;
}): Promise<number> {
  const {
    upload,
    file,
    signal,
    onProgress,
    maxRetries = 0,
    makeError = (message) => new Error(message),
  } = input;
  if (upload.method !== "PUT" || !Number.isSafeInteger(upload.chunkSize)
    || upload.chunkSize < 1 || upload.chunkSize > 4 * 1024 * 1024) {
    throw makeError("The media service returned an invalid resumable upload contract.");
  }
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) {
    throw makeError("The media service returned an invalid retry limit.");
  }
  let url: URL;
  try {
    url = new URL(upload.url, window.location.origin);
    if (url.origin !== window.location.origin || url.username || url.password || url.hash) throw new Error();
  } catch {
    throw makeError("The media service returned an unsafe resumable upload URL.");
  }
  if (!Number.isSafeInteger(input.initialOffset) || input.initialOffset < 0 || input.initialOffset > file.size) {
    throw makeError("The saved upload offset is invalid.");
  }

  let offset = input.initialOffset;
  while (offset < file.size) {
    if (signal.aborted) throw new DOMException("Upload cancelled.", "AbortError");
    const end = Math.min(offset + upload.chunkSize, file.size);
    const chunk = file.slice(offset, end);
    const digest = await sha256Hex(await chunk.arrayBuffer());
    let acknowledged = false;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (signal.aborted) throw new DOMException("Upload cancelled.", "AbortError");
      try {
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) {
            reject(new DOMException("Upload cancelled.", "AbortError"));
            return;
          }
          const xhr = new XMLHttpRequest();
          xhr.timeout = 120_000;
          let settled = false;
          const cleanup = () => {
            signal.removeEventListener("abort", abort);
            xhr.upload.onprogress = null;
            xhr.onload = null;
            xhr.onerror = null;
            xhr.ontimeout = null;
            xhr.onabort = null;
          };
          const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback();
          };
          const abort = () => xhr.abort();
          xhr.open("PUT", url.href);
          const headers = { ...(upload.headers ?? {}) };
          for (const [name, value] of Object.entries(authHeaders())) {
            if (!Object.keys(headers).some((existing) => existing.toLowerCase() === name.toLowerCase())) {
              headers[name] = value;
            }
          }
          headers["Content-Type"] = "application/octet-stream";
          headers["Upload-Offset"] = String(offset);
          headers["X-Chunk-SHA256"] = digest;
          headers["X-Media-Mime-Type"] = file.type;
          Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
          xhr.upload.onprogress = (event) => {
            const current = event.lengthComputable ? event.loaded : 0;
            onProgress(Math.min(file.size - 1, offset + current), file.size);
          };
          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
              finish(() => reject(makeError("Media chunk could not be uploaded. Check your connection and retry.", xhr.status)));
              return;
            }
            const serverOffset = xhr.getResponseHeader("Upload-Offset");
            if (serverOffset !== null && Number(serverOffset) !== end) {
              finish(() => reject(makeError("The media service did not confirm the expected upload offset.", xhr.status)));
              return;
            }
            finish(resolve);
          };
          xhr.onerror = () => finish(() => reject(makeError("Storage upload failed. Check your connection and retry.")));
          xhr.ontimeout = () => finish(() => reject(makeError("Storage upload timed out. You can retry.")));
          xhr.onabort = () => finish(() => reject(new DOMException("Upload cancelled.", "AbortError")));
          signal.addEventListener("abort", abort, { once: true });
          xhr.send(chunk);
        });
        acknowledged = true;
        break;
      } catch (error) {
        const status = error && typeof error === "object" && "status" in error
          ? Number((error as { status?: unknown }).status)
          : NaN;
        const retryable = !(error instanceof Error && error.name === "AbortError")
          && (!Number.isFinite(status) || status === 408 || status === 429 || status >= 500);
        if (!retryable || attempt === maxRetries) throw error;
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) {
            reject(new DOMException("Upload cancelled.", "AbortError"));
            return;
          }
          const abort = () => {
            window.clearTimeout(timer);
            reject(new DOMException("Upload cancelled.", "AbortError"));
          };
          const timer = window.setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, 250 * (attempt + 1));
          signal.addEventListener("abort", abort, { once: true });
        });
      }
    }
    if (!acknowledged) throw makeError("Media chunk could not be uploaded. Check your connection and retry.");
    offset = end;
    await input.onConfirmedOffset?.(offset);
    onProgress(Math.min(file.size - 1, offset), file.size);
  }
  return offset;
}