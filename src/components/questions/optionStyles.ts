import { cn } from '@/lib/utils'

interface OptionState {
  selected: boolean
  correct: boolean
  incorrect: boolean
  disabled: boolean
}

export function optionClassName({ selected, correct, incorrect, disabled }: OptionState) {
  return cn(
    'flex w-full items-start gap-3 rounded-md border-2 border-border bg-background px-4 py-3.5 text-left transition-colors',
    !disabled && 'hover:border-primary hover:bg-muted',
    disabled && 'cursor-default',
    selected && !correct && !incorrect && 'border-primary bg-primary/10',
    correct && 'border-success bg-success/10',
    incorrect && 'border-error bg-error/10',
  )
}

export function badgeClassName({ selected, correct, incorrect }: Omit<OptionState, 'disabled'>) {
  return cn(
    'flex size-[26px] shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground',
    selected && !correct && !incorrect && 'border-primary bg-primary text-primary-foreground',
    correct && 'border-success bg-success text-success-foreground',
    incorrect && 'border-error bg-error text-error-foreground',
  )
}

export function explanationClassName(correct: boolean) {
  return cn('text-sm leading-snug text-muted-foreground', correct ? 'text-success' : 'text-error')
}
