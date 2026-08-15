interface SourceEditorProps {
  onChange: (content: string) => void;
  value: string;
}

/**
 * Raw markdown source mode (⌘P): the whole file, frontmatter included, in a
 * plain monospace textarea wired to the same autosave as the rich editor.
 */
export function SourceEditor({ onChange, value }: SourceEditorProps) {
  return (
    <textarea
      aria-label="markdown source"
      className="allow-select min-h-0 w-full flex-1 resize-none bg-transparent px-6 py-6 font-editor-mono text-sm leading-relaxed outline-none"
      onChange={(event) => {
        onChange(event.target.value);
      }}
      spellCheck={false}
      value={value}
    />
  );
}
