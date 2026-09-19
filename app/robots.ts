import type { MetadataRoute } from "next"

const appUrl = process.env.AUTH_URL ?? "http://localhost:3000"

export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: "*", allow: "/" },
        sitemap: `${appUrl}/sitemap.xml`,
    }
}
