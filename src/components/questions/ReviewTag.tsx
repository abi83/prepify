interface Props {
  isSelected: boolean
  isCorrect: boolean
}

export default function ReviewTag({ isSelected, isCorrect }: Props) {
  if (isSelected) return <Tag>Your answer</Tag>
  if (isCorrect) return <Tag>Missed</Tag>
  return null
}

function Tag({ children }: { children: string }) {
  return <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>
}
