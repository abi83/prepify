import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [ { protocol: "https", hostname: "lh3.googleusercontent.com" } ],
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
