import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { listMyAssets } from "@/actions/assets"
import { listMyAttempts } from "@/actions/attempts"
import { getExistingRunSummary, getConcepts } from "@/actions/pipeline"
import { getMyPrep } from "@/actions/preps"
import { listMyQuestions } from "@/actions/questions"
import { ErrorState } from "@/components/ErrorState"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { NotFoundError, ForbiddenError } from "@/repositories/errors"

import PrepPage from "./PrepPage"

// Data changes per-user-action and there's no DB access at build time — always render per-request.
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const session = await auth()
    if (!session) redirect("/")

    let prep
    try {
        prep = await getMyPrep(id)
    } catch (e) {
        if (e instanceof NotFoundError) notFound()
        if (e instanceof ForbiddenError) {
            return (
                <ErrorState
                    message="You don't have access to this prep."
                    action={
                        <Button variant="link" className="h-auto p-0 text-muted-foreground" asChild>
                            <Link href="/preps">← My Preps</Link>
                        </Button>
                    }
                />
            )
        }
        throw e
    }

    const [ questions, attempts, runSummary, concepts ] = await Promise.all([
        listMyQuestions(id),
        listMyAttempts(id),
        getExistingRunSummary(id),
        getConcepts(id),
    ])

    const assets = questions.length > 0 ? await listMyAssets(questions.map(q => q.id)) : []

    return (
        <PrepPage
            prep={prep}
            questions={questions}
            attempts={attempts}
            assets={assets}
            runSummary={runSummary}
            concepts={concepts ?? []}
        />
    )
}
