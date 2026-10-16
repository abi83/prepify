import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isPrepTab, type PrepTab } from "@/types/prep"

import { PREP_TAB_REGISTRY } from "./tabs/registry"
import type { PrepTabProps } from "./tabs/types"

interface Props {
  tab: PrepTab
  onTabChange: (tab: PrepTab) => void
  data: PrepTabProps
}

/** Every tab stays mounted (inactive ones hidden), so a running generation and practice progress survive tab switches. */
export default function PrepTabs({ tab, onTabChange, data }: Props) {
  return (
    <Tabs
      value={tab}
      onValueChange={value => {
        if (!isPrepTab(value)) throw new Error(`Unexpected tab value from Tabs: ${value}`)
        onTabChange(value)
      }}
    >
      <TabsList className="sticky top-0 z-10 overflow-x-auto bg-background [scrollbar-width:none]">
        {PREP_TAB_REGISTRY.map(({ id, label, count }) => {
          const n = count(data)
          return (
            <TabsTrigger key={id} value={id} className="min-h-11 shrink-0 px-4">
              {label}{n !== null && <span className="ml-1.5 text-xs opacity-70">{n}</span>}
            </TabsTrigger>
          )
        })}
      </TabsList>
      {PREP_TAB_REGISTRY.map(({ id, Component }) => (
        <TabsContent key={id} value={id} forceMount hidden={id !== tab}>
          <Component {...data} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
