import type { ReactNode } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isPrepTab, type PrepTab } from "@/types/prep"

export interface PrepTabEntry<D> {
  id: PrepTab
  label: string
  /** Item count shown in the tab label; null hides it. */
  count: (data: D) => number | null
  Component: (props: D) => ReactNode
}

interface Props<D> {
  tab: PrepTab
  onTabChange: (tab: PrepTab) => void
  /** Tab order is display order. */
  tabs: PrepTabEntry<D>[]
  data: D
}

/** Every tab stays mounted (inactive ones hidden), so a running generation and practice progress survive tab switches. */
export default function PrepTabs<D extends object>({ tab, onTabChange, tabs, data }: Props<D>) {
  return (
    <Tabs
      value={tab}
      onValueChange={value => {
        if (!isPrepTab(value)) throw new Error(`Unexpected tab value from Tabs: ${value}`)
        onTabChange(value)
      }}
    >
      <TabsList className="sticky top-0 z-10 overflow-x-auto bg-background [scrollbar-width:none]">
        {tabs.map(({ id, label, count }) => {
          const n = count(data)
          return (
            <TabsTrigger key={id} value={id} className="min-h-11 shrink-0 px-4">
              {label}{n !== null && <span className="ml-1.5 text-xs opacity-70">{n}</span>}
            </TabsTrigger>
          )
        })}
      </TabsList>
      {tabs.map(({ id, Component }) => (
        <TabsContent key={id} value={id} forceMount hidden={id !== tab}>
          <Component {...data} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
