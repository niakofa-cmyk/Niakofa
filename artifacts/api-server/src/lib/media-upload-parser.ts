import express from "express";
import { MAX_MEDIA_BYTES } from "./media-validation";

/**
 * The universal media endpoint is a same-origin binary PUT, not a signed
 * storage-provider upload. Parse every content type as raw bytes so an
 * unexpected header cannot fall through to an independently buffered parser.
 * raw-body enforces this limit while reading the request stream.
 */
export function createMediaUploadParser(limitBytes = MAX_MEDIA_BYTES) {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < 1) {
    throw new Error("Media upload parser limit must be a positive safe integer.");
  }
  return express.raw({ type: () => true, limit: `${limitBytes}b` });
}

export const mediaUploadParser = createMediaUploadParser();