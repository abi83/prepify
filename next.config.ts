import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // recordSample carries base64 page images (uploads cap at 8 MB, ~10.7 MB encoded).
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    remotePatterns: [ { protocol: "https", hostname: "lh3.googleusercontent.com" } ],
    // Cloud Run's filesystem is in-memory and the `nextjs` user can't create .next/cache.
    maximumDiskCacheSize: 0,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [ { type: "host", value: "www.prepify.cc" } ],
        destination: "https://prepify.cc/:path*",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
