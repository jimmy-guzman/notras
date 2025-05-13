interface WelcomeBackProps {
  name: string;
}

export function WelcomeBack({ name }: WelcomeBackProps) {
  const [firstName] = name.split(" ");

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Welcome back to notras{firstName ? `, ${firstName}` : ""}
        {"  "}
        <span className="bg-foreground bg-clip-text text-transparent">👋</span>
      </h1>
      <p className="text-muted-foreground text-sm">
        Ready to capture more thoughts?
      </p>
    </div>
  );
}
