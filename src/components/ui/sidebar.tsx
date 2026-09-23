import { cn } from "cn";
import { createContext, useContext } from "react";
import type { ComponentProps } from "react";

const SidebarContext = createContext<boolean | null>(null);

function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === null) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function SidebarProvider({
  open,
  children,
  className,
  ...props
}: ComponentProps<"div"> & {
  open: boolean;
}) {
  return (
    <SidebarContext value={open}>
      <div
        data-slot="sidebar-wrapper"
        className={cn(
          "group/sidebar-wrapper flex min-h-0 rounded-lg",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext>
  );
}

function Sidebar({ children, className, ...props }: ComponentProps<"aside">) {
  const open = useSidebar();
  return (
    <aside
      data-slot="sidebar"
      hidden={!open}
      className={cn(
        "bg-background text-foreground flex size-full min-h-0 flex-col",
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-sidebar="group-label"
      data-slot="sidebar-group-label"
      className={cn(
        "text-muted-foreground ring-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-normal tracking-wider uppercase outline-hidden focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuButton({
  isActive = false,
  size = "default",
  className,
  ...props
}: ComponentProps<"button"> & {
  isActive?: boolean;
  size?: "default" | "note";
}) {
  return (
    <button
      data-active={isActive ? "" : undefined}
      data-sidebar="menu-button"
      data-slot="sidebar-menu-button"
      type="button"
      className={cn(
        "hover:bg-muted/50 focus-visible:inset-ring-ring data-active:bg-accent data-active:text-accent-foreground relative flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:inset-ring-2 [&_svg]:size-3.5 [&_svg]:shrink-0",
        size === "note"
          ? "data-active:before:bg-primary h-auto min-h-20 px-3 py-3 data-active:before:absolute data-active:before:inset-y-3 data-active:before:left-0 data-active:before:w-0.5 data-active:before:rounded-full"
          : "min-h-8 px-2 py-1.5 text-xs pointer-coarse:min-h-11",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenuBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="sidebar-menu-badge"
      className={cn(
        "text-muted-foreground ml-auto shrink-0 text-xs font-normal tabular-nums",
        className
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
};
