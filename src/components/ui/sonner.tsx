"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

// Colors come from the CSS variables, so toasts follow the `dark` class on <html>.
const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster group"
    style={
      {
        "--normal-bg": "var(--ui-popover)",
        "--normal-text": "var(--ui-popover-foreground)",
        "--normal-border": "var(--ui-border)",
      } as React.CSSProperties
    }
    {...props}
  />
)

export { Toaster }
