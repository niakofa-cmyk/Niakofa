type CompletionErrorLike = Error & {
  status?: number;
  data?: unknown;
};

export function readCompletionError(error: unknown): { title: string; description: string } {
  const candidate = error as CompletionErrorLike;
  const data = candidate?.data;
  const serverMessage = data && typeof data === "object"
    ? ["error", "message", "detail"]
      .map((key) => (data as Record<string, unknown>)[key])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    : undefined;

  const status = typeof candidate?.status === "number" ? candidate.status : undefined;
  if (/already completed/i.test(serverMessage ?? candidate?.message ?? "")) {
    return { title: "Request already completed", description: serverMessage ?? candidate.message };
  }
  if (status === 409) {
    return { title: "Request changed", description: serverMessage ?? "This request changed state before it could be completed. Refresh the request and try again." };
  }
  if (status === 403) {
    return { title: "Completion not authorized", description: serverMessage ?? "Only the assigned helper can complete this request." };
  }
  if (status === 404) {
    return { title: "Request no longer available", description: serverMessage ?? "The request was completed, cancelled, or is no longer assigned to you." };
  }
  if (status !== undefined && status >= 500) {
    return { title: "Server could not complete the request", description: serverMessage ?? "The server returned a temporary error. Refresh the request and try again." };
  }
  return {
    title: "Failed to complete",
    description: serverMessage ?? ((candidate instanceof Error && candidate.message) || "The server could not complete this request. Please try again."),
  };
}