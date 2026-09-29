import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth";

/**
 * Family asset keys are server-owned paths. Keep the client URL construction
 * strict so a malformed API response cannot turn into an arbitrary request.
 */
export function familyAssetPath(storageKey: string): string {
  const segments = storageKey.split("/");
  if (
    segments.length < 5
    || segments[0] !== "families"
    || segments[2] !== "memories"
    || segments.some((segment) => !segment || segment === "." || segment === "..")
    || !/^\d+$/.test(segments[1] ?? "")
    || !/^\d+$/.test(segments[3] ?? "")
  ) {
    throw new Error("The Family Vault returned an invalid media reference.");
  }
  return `/api/family/assets/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export function useAuthorizedFamilyAsset(storageKey: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(storageKey));

  useEffect(() => {
    if (!storageKey) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    setLoading(true);

    let assetPath: string;
    try {
      assetPath = familyAssetPath(storageKey);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "This family attachment could not be opened.");
      setLoading(false);
      return () => controller.abort();
    }

    void fetch(assetPath, {
      headers: authHeaders(),
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("This family attachment could not be opened.");
        const nextUrl = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setUrl(nextUrl);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "This family attachment could not be opened.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storageKey]);

  return { url, error, loading };
}