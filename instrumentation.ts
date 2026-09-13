export async function register() {
  // register() is also bundled for the Edge runtime, where process.exit doesn't exist — this
  // app has no edge routes, so skip validation there rather than failing the edge bundle.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // A thrown error here surfaces in logs but doesn't stop Next from listening — process.exit
  // forces an actual boot failure instead of a container that looks healthy but is misconfigured.
  try {
    await import('./src/lib/env')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
