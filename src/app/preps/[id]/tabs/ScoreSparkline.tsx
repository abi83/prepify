import type { Attempt } from "@prisma/client"

import { attemptPct } from "@/lib/attemptStats"

const MAX_BARS = 20
const BAR_WIDTH = 8
const GAP = 3
const HEIGHT = 32

/** Score % per attempt, oldest to newest. `attempts` is newest first. */
export default function ScoreSparkline({ attempts }: { attempts: Attempt[] }) {
  const pcts = attempts.slice(0, MAX_BARS).map(attemptPct).reverse()
  const width = pcts.length * (BAR_WIDTH + GAP) - GAP
  return (
    <svg role="img" aria-label={`Scores: ${pcts.map(p => `${p}%`).join(", ")}`} width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="fill-primary">
      {pcts.map((pct, i) => {
        const h = Math.max(2, (pct / 100) * HEIGHT)
        return <rect key={i} x={i * (BAR_WIDTH + GAP)} y={HEIGHT - h} width={BAR_WIDTH} height={h} rx={1.5} />
      })}
    </svg>
  )
}
