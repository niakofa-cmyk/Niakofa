import { spawn } from "node:child_process";

export function hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/gif") return buffer.subarray(0, 4).toString("ascii") === "GIF8";
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "video/mp4") return buffer.subarray(4, 16).toString("ascii").includes("ftyp");
  if (mimeType === "video/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mimeType === "audio/ogg") return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (mimeType === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "audio/mpeg") return buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  return false;
}

function imageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png" && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mimeType === "image/gif" && buffer.length >= 10) return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (mimeType === "image/webp" && buffer.length >= 30 && buffer.subarray(12, 16).toString("ascii") === "VP8X") {
    return {
      width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16),
      height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16),
    };
  }
  if (mimeType !== "image/jpeg") return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += length + 2;
  }
  return null;
}

function probeVideo(buffer: Buffer): Promise<{ width: number | null; height: number | null; duration_ms: number | null } | null> {
  return new Promise((resolve) => {
    const child = spawn(process.env["FFPROBE_PATH"] || "ffprobe", [
      "-v", "error", "-i", "pipe:0", "-show_entries", "stream=width,height,duration", "-of", "json",
    ]);
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0 || stderr || !chunks.length) return resolve(null);
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString()) as { streams?: Array<{ width?: number; height?: number; duration?: string }> };
        const stream = parsed.streams?.find((item) => item.width || item.height || item.duration);
        if (!stream) return resolve(null);
        const duration = stream.duration ? Math.round(Number(stream.duration) * 1000) : null;
        resolve({
          width: Number.isFinite(stream.width) ? Number(stream.width) : null,
          height: Number.isFinite(stream.height) ? Number(stream.height) : null,
          duration_ms: duration && duration > 0 ? duration : null,
        });
      } catch { resolve(null); }
    });
    child.stdin.end(buffer);
  });
}

export async function inspectMedia(buffer: Buffer, mimeType: string): Promise<{ width: number | null; height: number | null; duration_ms: number | null } | null> {
  if (mimeType.startsWith("image/")) {
    const dimensions = imageDimensions(buffer, mimeType);
    return dimensions ? { ...dimensions, duration_ms: null } : null;
  }
  if (mimeType.startsWith("video/")) return probeVideo(buffer);
  return { width: null, height: null, duration_ms: null };
}