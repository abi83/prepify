import type { Prep } from "@prisma/client"
import { describe, it, expect, vi, beforeEach } from "vitest"

const { getSignedUrlMock, deleteMock } = vi.hoisted(() => ({
  getSignedUrlMock: vi.fn().mockResolvedValue([ "https://signed.example/read" ]),
  deleteMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn().mockImplementation(function Storage() {
    return {
      bucket: vi.fn().mockReturnValue({
        file: vi.fn().mockReturnValue({ getSignedUrl: getSignedUrlMock, delete: deleteMock }),
      }),
    }
  }),
}))

vi.mock("@/lib/env", () => ({ config: { GCS_BUCKET_NAME: "test-bucket" } }))
vi.mock("@/lib/currentUser", () => ({ requireUserId: vi.fn() }))
vi.mock("@/repositories/prepRepository", () => ({ getPrep: vi.fn() }))

import { deletePrepObjects, getReadSignedUrl } from "@/actions/uploads"
import { requireUserId } from "@/lib/currentUser"
import { ForbiddenError } from "@/repositories/errors"
import * as prepRepository from "@/repositories/prepRepository"

const requireUserIdMock = requireUserId as unknown as ReturnType<typeof vi.fn>
const getPrepMock = prepRepository.getPrep as unknown as ReturnType<typeof vi.fn>

function prep(overrides: Partial<Prep> = {}): Prep {
  return { id: "prep-1", userId: "owner", visibility: "private", ...overrides } as Prep
}

beforeEach(() => {
  vi.clearAllMocks()
  getSignedUrlMock.mockResolvedValue([ "https://signed.example/read" ])
  deleteMock.mockResolvedValue(undefined)
})

describe("getReadSignedUrl", () => {
  it("mints a read URL for the prep owner", async () => {
    requireUserIdMock.mockResolvedValue("owner")
    getPrepMock.mockResolvedValue(prep())

    const url = await getReadSignedUrl("prep-1", "prep-pages/prep-1/page-0.jpg")

    expect(url).toBe("https://signed.example/read")
    expect(getPrepMock).toHaveBeenCalledWith("owner", "prep-1")
    expect(getSignedUrlMock).toHaveBeenCalledWith(expect.objectContaining({ action: "read" }))
  })

  it("mints a read URL for a non-owner reading a public prep", async () => {
    requireUserIdMock.mockResolvedValue("other-user")
    getPrepMock.mockResolvedValue(prep({ visibility: "public" }))

    await expect(getReadSignedUrl("prep-1", "prep-pages/prep-1/page-0.jpg")).resolves.toBe("https://signed.example/read")
  })

  it("propagates ForbiddenError for a prep the user can't read", async () => {
    requireUserIdMock.mockResolvedValue("other-user")
    getPrepMock.mockRejectedValue(new ForbiddenError("Prep prep-1 is private"))

    await expect(getReadSignedUrl("prep-1", "prep-pages/prep-1/page-0.jpg")).rejects.toThrow(ForbiddenError)
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })
})

describe("deletePrepObjects", () => {
  it("deletes every given GCS key, ignoring ones already gone", async () => {
    await deletePrepObjects([ "prep-pages/prep-1/page-0.jpg", "prep-pages/prep-1/page-1.jpg" ])

    expect(deleteMock).toHaveBeenCalledTimes(2)
    expect(deleteMock).toHaveBeenCalledWith({ ignoreNotFound: true })
  })
})
