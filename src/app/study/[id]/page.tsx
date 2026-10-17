import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { listSharedAssets } from "@/actions/assets"
import { getPrepCost, getPrepTokens, getSharedPrep } from "@/actions/preps"
import { listConcepts, listJobGenerations } from "@/actions/prepState"
import { listSharedQuestions } from "@/actions/questions"
import { ErrorState } from "@/components/ErrorState"
import { currentUserId } from "@/lib/currentUser"
import { NotFoundError, ForbiddenError } from "@/repositories/errors"

import StudyPage from "./StudyPage"

// Data changes per-user-action and there's no DB access at build time — always render per-request.
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const prep = await getSharedPrep(id)
    const description = prep.description || `Study ${prep.title} with flashcards and practice questions.`
    return {
      title: prep.title,
      description,
      openGraph: { title: prep.title, description },
    }
  } catch {
    return { title: "Study" }
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let prep
  try {
    prep = await getSharedPrep(id)
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    if (e instanceof ForbiddenError) return <ErrorState message="This prep is private." />
    throw e
  }

  const [ userId, questions, concepts, generations, tokensUsed, costUsd ] = await Promise.all([
    currentUserId(),
    listSharedQuestions(id),
    listConcepts(id),
    listJobGenerations(id),
    getPrepTokens(id),
    getPrepCost(id),
  ])
  const assets = questions.length > 0 ? await listSharedAssets(questions.map(q => q.id)) : []

  return (
    <StudyPage
      userId={userId}
      prep={prep}
      questions={questions}
      assets={assets}
      concepts={concepts}
      generations={generations}
      tokensUsed={tokensUsed}
      costUsd={costUsd}
    />
  )
}
