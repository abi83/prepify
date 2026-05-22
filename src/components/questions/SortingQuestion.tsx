import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SortingContent } from '../../types/questions'
import styles from './SortingQuestion.module.css'

interface Props {
  content: SortingContent
  selected: string[]  // ordered array of answer ids
  isReview: boolean
  onChange?: (order: string[], isValid: boolean) => void
}

interface ItemProps {
  id: string
  text: string
  index: number
  isInteractive: boolean
  isCorrect?: boolean
  isIncorrect?: boolean
  correctIndex?: number
  explanation?: string
}

function SortableItem({ id, text, index, isInteractive, isCorrect, isIncorrect, correctIndex, explanation }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !isInteractive,
  })

  const style = { transform: CSS.Transform.toString(transform), transition }

  let cls = styles.item
  if (isInteractive) cls += ` ${styles.draggable}`
  if (isDragging) cls += ` ${styles.dragging}`
  if (isCorrect) cls += ` ${styles.correct}`
  if (isIncorrect) cls += ` ${styles.incorrect}`

  return (
    <div ref={setNodeRef} style={style}>
      <div className={cls} {...attributes} {...listeners}>
        {isInteractive && (
          <span className={styles.grip}>⠿</span>
        )}
        <span className={styles.index}>{index + 1}.</span>
        <span className={styles.itemBody}>
          <span className={styles.text}>{text}</span>
          {(isCorrect || isIncorrect) && correctIndex !== undefined && (
            <span className={isCorrect ? styles.correctPos : styles.incorrectPos}>
              {isCorrect ? '✓ Correct position' : `Correct position: ${correctIndex}`}
            </span>
          )}
          {explanation && (isCorrect || isIncorrect) && (
            <span className={styles.explanation}>{explanation}</span>
          )}
        </span>
      </div>
    </div>
  )
}

export default function SortingQuestion({ content, selected, isReview, onChange }: Props) {
  const initialOrder = content.answers.map(a => a.id)
  const [order, setOrder] = useState<string[]>(selected.length ? selected : initialOrder)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = order.indexOf(active.id as string)
    const newIdx = order.indexOf(over.id as string)
    const newOrder = arrayMove(order, oldIdx, newIdx)
    setOrder(newOrder)
    onChange?.(newOrder, true)
  }

  const answersMap = new Map(content.answers.map(a => [a.id, a]))

  return (
    <div className={styles.root}>
      {!isReview && <span className={styles.hint}>Drag items into the correct order (top = first)</span>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className={styles.list}>
            {order.map((id, i) => {
              const answer = answersMap.get(id)
              if (!answer) return null
              const isCorrect = isReview && answer.correct_index === i + 1
              const isIncorrect = isReview && answer.correct_index !== i + 1
              return (
                <SortableItem
                  key={id}
                  id={id}
                  text={answer.text}
                  index={i}
                  isInteractive={!isReview}
                  isCorrect={isReview ? isCorrect : undefined}
                  isIncorrect={isReview ? isIncorrect : undefined}
                  correctIndex={answer.correct_index}
                  explanation={isReview ? answer.explanation : undefined}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
