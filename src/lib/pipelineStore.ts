import { supabase } from './supabase'
import type { Concept, QuestionTask } from '../types/pipeline'
import type { GeneratedQuestion } from '../types/questions'

export interface PipelineRunState {
  runId: string
  concepts: Concept[] | null
  questionTasks: QuestionTask[] | null
  // Map from task_index → built question (null means not yet built)
  questionSlots: Map<number, GeneratedQuestion | null>
}

export async function loadOrCreateRun(prepId: string): Promise<PipelineRunState> {
  const { data: existing } = await supabase
    .from('pipeline_runs')
    .select('id, concepts, question_tasks')
    .eq('prep_id', prepId)
    .maybeSingle()

  if (existing) {
    const { data: slots } = await supabase
      .from('pipeline_questions')
      .select('task_index, question')
      .eq('run_id', existing.id)
      .order('task_index')

    const questionSlots = new Map<number, GeneratedQuestion | null>(
      (slots ?? []).map(s => [s.task_index, s.question as GeneratedQuestion | null])
    )

    return {
      runId: existing.id,
      concepts: existing.concepts as Concept[] | null,
      questionTasks: existing.question_tasks as QuestionTask[] | null,
      questionSlots,
    }
  }

  const { data: created, error } = await supabase
    .from('pipeline_runs')
    .insert({ prep_id: prepId })
    .select('id')
    .single()

  if (!created) throw new Error(`Failed to create pipeline run: ${error?.message}`)

  return { runId: created.id, concepts: null, questionTasks: null, questionSlots: new Map() }
}

export async function saveConcepts(runId: string, concepts: Concept[]) {
  await supabase
    .from('pipeline_runs')
    .update({ concepts, updated_at: new Date().toISOString() })
    .eq('id', runId)
}

export async function saveQuestionTasksAndInitSlots(runId: string, tasks: QuestionTask[]) {
  await supabase
    .from('pipeline_runs')
    .update({ question_tasks: tasks, updated_at: new Date().toISOString() })
    .eq('id', runId)

  const rows = tasks.map((task, i) => ({ run_id: runId, task_index: i, task, question: null }))
  await supabase.from('pipeline_questions').insert(rows)
}

export async function saveQuestionSlot(runId: string, taskIndex: number, question: GeneratedQuestion) {
  const { error } = await supabase
    .from('pipeline_questions')
    .update({ question })
    .eq('run_id', runId)
    .eq('task_index', taskIndex)
  if (error) throw new Error(`Failed to persist question slot ${taskIndex}: ${error.message}`)
}

export async function deleteRun(prepId: string) {
  // pipeline_questions cascade-delete via FK on delete cascade
  await supabase.from('pipeline_runs').delete().eq('prep_id', prepId)
}

// ── Read-only summary for the UI (no side effects) ──────────────────────────

export interface PartialRunSummary {
  hasConcepts: boolean
  totalTasks: number      // 0 until task list is built
  completedSlots: number  // non-null question slots (craft+review both done)
}

export async function getExistingRunSummary(prepId: string): Promise<PartialRunSummary | null> {
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('id, concepts, question_tasks')
    .eq('prep_id', prepId)
    .maybeSingle()

  if (!run) return null

  const { count } = await supabase
    .from('pipeline_questions')
    .select('*', { count: 'exact', head: true })
    .eq('run_id', run.id)
    .not('question', 'is', null)

  return {
    hasConcepts: run.concepts !== null,
    totalTasks: Array.isArray(run.question_tasks) ? (run.question_tasks as unknown[]).length : 0,
    completedSlots: count ?? 0,
  }
}
