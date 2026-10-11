export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[THIRD EYE Runtime Error]:", error, context);
}
