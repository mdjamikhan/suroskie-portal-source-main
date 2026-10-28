// Runs once when the server starts: fail fast on missing/invalid configuration instead of
// erroring on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    env();
  }
}
