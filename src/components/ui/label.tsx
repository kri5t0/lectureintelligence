import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-xs font-semibold tracking-wider text-muted-foreground uppercase select-none",
        className
      )}
      {...props}
    />
  )
}

export { Label }
