import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    output: "standalone",
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
