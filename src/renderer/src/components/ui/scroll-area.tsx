"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Historically this was a radix ScrollArea wrapper, but we unified scrollbar
// styling via the `scrollbar-themed` utility so every scroll surface matches
// the diff viewer. This is a thin drop-in that keeps the shadcn API while
// rendering a plain overflow-auto container.
const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function ScrollArea({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="scroll-area"
        className={cn("scrollbar-themed overflow-auto", className)}
        {...props}
      >
        <div data-slot="scroll-area-viewport" className="size-full">
          {children}
        </div>
      </div>
    )
  },
)

function ScrollBar(_props: { orientation?: "vertical" | "horizontal"; className?: string }) {
  return null
}

export { ScrollArea, ScrollBar }
