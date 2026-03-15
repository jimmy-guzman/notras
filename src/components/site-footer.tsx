import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { getBuildInfo } from "@/lib/utils/build-info";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const { buildTime, commitUrl, shortSha } = getBuildInfo();

  return (
    <footer className="flex w-full flex-col gap-4 border-t p-6 text-sm text-muted-foreground">
      <p>just write, otra vez.</p>
      <nav className="flex items-center gap-4">
        <KeyboardShortcutsDialog>keyboard shortcuts</KeyboardShortcutsDialog>
      </nav>
      <p className="text-xs">
        © {year}{" "}
        <a
          className="underline underline-offset-4"
          href="https://www.jimmy.codes/"
          rel="noopener noreferrer"
          target="_blank"
        >
          jimmy guzman moreno
        </a>
        {(buildTime ?? shortSha) && <span> · </span>}
        {buildTime && <span>built {buildTime}</span>}
        {buildTime && shortSha && <span> · </span>}
        {shortSha && (
          <a
            className="underline underline-offset-4"
            href={commitUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {shortSha}
          </a>
        )}
      </p>
    </footer>
  );
}
