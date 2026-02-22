import { format } from "date-fns";

export function SiteFooter() {
  const year = format(new Date(), "yyyy");

  return (
    <footer className="flex w-full flex-col items-center border-t p-4 text-center text-sm text-muted-foreground">
      <p>
        © {year}{" "}
        <a
          className="underline underline-offset-4"
          href="https://www.jimmy.codes/"
          rel="noopener noreferrer"
          target="_blank"
        >
          Jimmy Guzman Moreno
        </a>
        . Built with{" "}
        <span className="bg-red-400 bg-clip-text text-transparent">❤️</span> and
        minimalism.
      </p>
    </footer>
  );
}
