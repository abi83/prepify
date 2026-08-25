import { vi } from 'vitest'
import '@testing-library/jest-dom'

// next-auth's `lib/env.js` imports the bare `next/server` specifier at module
// scope, which fails Node ESM resolution outside of Next's own bundler
// (see https://github.com/nextauthjs/next-auth/issues re: package.json#exports).
// Only `NextRequest` is referenced, and only inside a helper this app never hits.
vi.mock('next/server', () => ({ NextRequest: class NextRequest {} }))
