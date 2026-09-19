"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

export default function ThemeToggle() {
  const [ isDark, setIsDark ] = useState(true)

  useEffect(() => {
    // Reads the theme class an inline pre-hydration script sets on <html>;
    // SSR has no DOM to read, so this must run after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
    setIsDark(next)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="fixed top-4 right-4 z-40"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
