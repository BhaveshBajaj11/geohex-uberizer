"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./sidebar"

interface ResizableSidebarProps {
  children: React.ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  className?: string
}

interface ResizableSidebarInsetProps {
  children: React.ReactNode
  className?: string
}

const ResizableSidebarContext = React.createContext<{
  width: number
  setWidth: (width: number) => void
  isResizing: boolean
  setIsResizing: (isResizing: boolean) => void
} | null>(null)

const useResizableSidebar = () => {
  const context = React.useContext(ResizableSidebarContext)
  if (!context) {
    throw new Error("useResizableSidebar must be used within a ResizableSidebarProvider")
  }
  return context
}

const ResizableSidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
    defaultWidth?: number
    minWidth?: number
    maxWidth?: number
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      defaultWidth = 256, // 16rem in pixels
      minWidth = 200,
      maxWidth = 500,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const [width, setWidth] = React.useState(defaultWidth)
    const [isResizing, setIsResizing] = React.useState(false)

    const contextValue = React.useMemo(
      () => ({
        width,
        setWidth,
        isResizing,
        setIsResizing,
      }),
      [width, isResizing]
    )

    return (
      <ResizableSidebarContext.Provider value={contextValue}>
        <SidebarProvider
          defaultOpen={defaultOpen}
          open={openProp}
          onOpenChange={setOpenProp}
          style={{
            "--sidebar-width": `${width}px`,
            "--sidebar-min-width": `${minWidth}px`,
            "--sidebar-max-width": `${maxWidth}px`,
            ...style,
          } as React.CSSProperties}
          className={cn(className)}
          ref={ref}
          {...props}
        >
          {children}
        </SidebarProvider>
      </ResizableSidebarContext.Provider>
    )
  }
)
ResizableSidebarProvider.displayName = "ResizableSidebarProvider"

const ResizableSidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" | "inset"
    collapsible?: "offcanvas" | "icon" | "none"
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { width, setWidth, isResizing, setIsResizing } = useResizableSidebar()
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar()
    const [startX, setStartX] = React.useState(0)
    const [startWidth, setStartWidth] = React.useState(0)

    const handleMouseDown = React.useCallback(
      (e: React.MouseEvent) => {
        if (isMobile || state === "collapsed") return
        
        e.preventDefault()
        setIsResizing(true)
        setStartX(e.clientX)
        setStartWidth(width)
        
        // Add global event listeners
        const handleMouseMove = (e: MouseEvent) => {
          const deltaX = side === "left" ? e.clientX - startX : startX - e.clientX
          const newWidth = Math.max(200, Math.min(500, startWidth + deltaX))
          setWidth(newWidth)
        }

        const handleMouseUp = () => {
          setIsResizing(false)
          document.removeEventListener("mousemove", handleMouseMove)
          document.removeEventListener("mouseup", handleMouseUp)
        }

        document.addEventListener("mousemove", handleMouseMove)
        document.addEventListener("mouseup", handleMouseUp)
      },
      [isMobile, state, width, startX, startWidth, side, setWidth, setIsResizing]
    )

    if (collapsible === "none") {
      return (
        <div
          className={cn(
            "flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      )
    }

    if (isMobile) {
      return (
        <Sidebar
          side={side}
          variant={variant}
          collapsible={collapsible}
          className={className}
          ref={ref}
          {...props}
        >
          {children}
        </Sidebar>
      )
    }

    return (
      <div
        ref={ref}
        className="group peer hidden md:block text-sidebar-foreground"
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-variant={variant}
        data-side={side}
      >
        {/* This is what handles the sidebar gap on desktop */}
        <div
          className={cn(
            "duration-200 relative h-svh w-[--sidebar-width] bg-transparent transition-[width] ease-linear",
            "group-data-[collapsible=offcanvas]:w-0",
            "group-data-[side=right]:rotate-180",
            variant === "floating" || variant === "inset"
              ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
              : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]"
          )}
        />
        <div
          className={cn(
            "duration-200 fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] ease-linear md:flex",
            side === "left"
              ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
              : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
            // Adjust the padding for floating and inset variants.
            variant === "floating" || variant === "inset"
              ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]"
              : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l",
            className
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow"
          >
            {children}
          </div>
          
          {/* Resize handle */}
          {state === "expanded" && (
            <div
              className={cn(
                "absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-sidebar-border transition-colors",
                side === "left" ? "right-0" : "left-0",
                isResizing && "bg-sidebar-border"
              )}
              onMouseDown={handleMouseDown}
            />
          )}
        </div>
      </div>
    )
  }
)
ResizableSidebar.displayName = "ResizableSidebar"

const ResizableSidebarInset = React.forwardRef<
  HTMLDivElement,
  ResizableSidebarInsetProps
>(({ className, children, ...props }, ref) => {
  return (
    <SidebarInset
      ref={ref}
      className={cn(className)}
      {...props}
    >
      {children}
    </SidebarInset>
  )
})
ResizableSidebarInset.displayName = "ResizableSidebarInset"

export {
  ResizableSidebar,
  ResizableSidebarInset,
  ResizableSidebarProvider,
  useResizableSidebar,
}

// Re-export the original components with new names
export const ResizableSidebarContent = SidebarContent
export const ResizableSidebarHeader = SidebarHeader
export const ResizableSidebarTrigger = SidebarTrigger
