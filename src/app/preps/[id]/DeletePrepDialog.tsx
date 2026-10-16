"use client"

import type { Prep } from "@prisma/client"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { deletePrep } from "@/actions/preps"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Props {
  prep: Prep
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function DeletePrepDialog({ prep, open, onOpenChange }: Props) {
  const router = useRouter()
  const [ deleting, setDeleting ] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await deletePrep(prep.id)
    router.push("/preps")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete prep?</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{prep.title}</strong> and all its questions, attempts, and generation data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
