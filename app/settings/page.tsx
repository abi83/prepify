import { redirect } from "next/navigation"
import { Suspense } from "react"

import { auth } from "@/lib/auth"

import SettingsPage from "./SettingsPage"

export const dynamic = "force-dynamic"

export default async function Page() {
    const session = await auth()
    if (!session) redirect("/")

    return (
        <Suspense fallback={null}>
            <SettingsPage />
        </Suspense>
    )
}
