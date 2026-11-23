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
        className={cn("group/sidebar-wrapper flex min-h-0", className)}
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
        "text-foreground flex size-full min-h-0 flex-col",
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden outline-none",
        className
      )}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col", className)}
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

/** A row runs the full width of the sidebar, and its hover and active fills are tints of the text color, so they show on the shell in every theme. */
function SidebarMenuButton({
  depth = 0,
  isActive = false,
  className,
  ...props
}: ComponentProps<"button"> & {
  /** How many branches the row sits under. Only its content steps in, by the width of a branch's icon and gap. */
  depth?: number;
  isActive?: boolean;
}) {
  return (
    <button
      data-active={isActive ? "" : undefined}
      data-sidebar="menu-button"
      data-slot="sidebar-menu-button"
      type="button"
      style={{ "--depth": depth }}
      className={cn(
        "group/menu-button hover:bg-foreground/4 data-active:bg-foreground/8 relative flex min-h-7 w-full items-center gap-2 py-1 ps-[calc(0.75rem+var(--depth)*1.375rem)] pe-3 text-left text-sm focus-visible:-outline-offset-2 pointer-coarse:min-h-11 [&_svg]:size-3.5 [&_svg]:shrink-0",
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
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
};
