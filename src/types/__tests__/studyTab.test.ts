import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

import { PREP_TAB_REGISTRY } from "@/app/preps/[id]/tabs/registry"
import { SHARED_TABS } from "@/components/prep/tabs/sharedTabs"
import { OWNER_ONLY_TABS, PREP_TABS, parseStudyTab } from "@/types/prep"

describe("tab registries", () => {
  it("list every tab id once, in PREP_TABS order, for the owner", () => {
    expect(PREP_TAB_REGISTRY.map(tab => tab.id)).toEqual([ ...PREP_TABS ])
  })

  it("list the owner's tabs minus the owner-only ones for the shared view", () => {
    const sharedIds = PREP_TAB_REGISTRY.map(tab => tab.id).filter(id => !OWNER_ONLY_TABS.some(only => only === id))
    expect(SHARED_TABS.map(tab => tab.id)).toEqual(sharedIds)
  })

  it("share labels between the views", () => {
    for (const shared of SHARED_TABS) expect(PREP_TAB_REGISTRY.find(tab => tab.id === shared.id)?.label).toBe(shared.label)
  })
})

describe("parseStudyTab", () => {
  it.each([ [ "concepts", "concepts" ], [ "pages", "main" ], [ "generation", "main" ], [ "nope", "main" ], [ null, "main" ] ])("%s -> %s", (value, expected) => {
    expect(parseStudyTab(value)).toBe(expected)
  })
})
