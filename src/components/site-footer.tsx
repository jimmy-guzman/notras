import { getBuildInfo } from "@/lib/utils/build-info";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const { buildTime, commitUrl, shortSha } = getBuildInfo();

  return (
    <footer className="flex w-full flex-col items-center gap-1 border-t p-4 text-center text-sm text-muted-foreground">
      <p>
        © {year}{" "}
        <a
          className="underline underline-offset-4"
          href="https://www.jimmy.codes/"
          rel="noopener noreferrer"
          target="_blank"
        >
          jimmy guzman moreno
        </a>
      </p>
      {(buildTime ?? shortSha) && (
        <p className="text-xs">
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
      )}
    </footer>
  );
}
