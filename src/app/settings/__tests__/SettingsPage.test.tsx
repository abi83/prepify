import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/actions/preps", () => ({
  getTotalTokens: vi.fn().mockResolvedValue(0),
  getTotalCost: vi.fn().mockResolvedValue(0),
}))

import SettingsPage from "@/app/settings/SettingsPage"
import { testCatalog } from "@/test/modelCatalog"

function store(model: string, tier: string, provider?: string) {
  localStorage.setItem("prepify_api_key", JSON.stringify({ key: "sk-test", model, tier, provider }))
}

beforeEach(() => localStorage.clear())

describe("SettingsPage model selection", () => {
  it("offers only the openai models and the tiers of the selected model", async () => {
    store("gpt-5-nano", "flex")
    render(<SettingsPage catalog={testCatalog} />)
    const [ , modelSelect, tierSelect ] = screen.getAllByRole("combobox")

    await userEvent.click(modelSelect)
    const modelOptions = screen.getAllByRole("option").map(o => o.textContent)
    expect(modelOptions).toContain("GPT-5 Mini")
    expect(modelOptions).not.toContain("Gemma")
    expect(modelOptions).not.toContain("local-model")
    await userEvent.keyboard("{Escape}")

    await userEvent.click(tierSelect)
    expect(screen.getAllByRole("option").map(o => o.textContent)).toEqual([ "Flex", "Standard", "Priority" ])
  })

  it("shows an error and resets to the defaults when the stored model left the catalog", async () => {
    store("gpt-5", "flex")
    render(<SettingsPage catalog={testCatalog} />)

    expect(screen.getByRole("alert").textContent).toContain("Saved model \"gpt-5\" is no longer available")
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: "Reset model and tier" }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getAllByRole("combobox")).toHaveLength(3)
  })

  it("shows an error when the stored tier is not available for the model", () => {
    store("gpt-5-nano", "ultra")
    render(<SettingsPage catalog={testCatalog} />)
    expect(screen.getByRole("alert").textContent).toContain("Saved tier \"ultra\"")
  })

  it("offers the gemini models and tiers for a stored gemini config", async () => {
    store("gemini-3.1-flash-lite", "flex", "gemini")
    render(<SettingsPage catalog={testCatalog} />)
    const [ , modelSelect, tierSelect ] = screen.getAllByRole("combobox")

    await userEvent.click(modelSelect)
    expect(screen.getAllByRole("option").map(o => o.textContent)).toEqual([ "Gemini 3.1 Flash-Lite" ])
    await userEvent.keyboard("{Escape}")

    await userEvent.click(tierSelect)
    expect(screen.getAllByRole("option").map(o => o.textContent)).toEqual([ "Flex", "Standard" ])
  })

  it("switching provider swaps the key and resets to that provider's default model", async () => {
    store("gpt-5-mini", "flex")
    render(<SettingsPage catalog={testCatalog} />)

    await userEvent.click(screen.getAllByRole("combobox")[0])
    await userEvent.click(screen.getByRole("option", { name: "Gemini" }))

    expect(screen.getByPlaceholderText("AIza...")).toHaveValue("")
    expect(screen.getByRole("heading", { name: "Gemini API Key" })).toBeTruthy()
    expect(screen.getAllByRole("combobox")[1].textContent).toContain("Gemini 3.1 Flash-Lite")
  })
})
