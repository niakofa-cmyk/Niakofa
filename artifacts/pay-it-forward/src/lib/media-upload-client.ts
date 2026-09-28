import { authHeaders } from "@/lib/auth";

export type BinaryUploadDescriptor = {
  method: string;
  url: string;
  headers: Record<string, string>;
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