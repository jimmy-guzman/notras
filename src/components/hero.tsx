export function Hero() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome to notras{" "}
        <span className="bg-foreground bg-clip-text text-transparent">👋</span>
      </h1>
      <p className="text-sm text-muted-foreground">
        A simple space to capture your thoughts as they come.
      </p>
    </div>
  );
}
