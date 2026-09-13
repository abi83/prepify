export async function register() {
  // Validates required env vars at process startup — throws and crashes boot on misconfiguration
  // instead of surfacing a confusing runtime error on first request.
  await import('./src/lib/env')
}
