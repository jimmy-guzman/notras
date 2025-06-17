export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto w-full max-w-7xl py-8">{children}</div>;
}
