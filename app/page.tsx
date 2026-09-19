import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

import Home from "./Home"

export const dynamic = "force-dynamic"

export default async function Page() {
    const session = await auth()
    if (session) redirect("/preps")
    return <Home />
}
