import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FolderIcon,
  HashIcon,
  LinkIcon,
  TextSearchIcon,
} from "lucide-react";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

const filters = [
  { Icon: FolderIcon, label: "folder", prefix: "folder:" },
  { Icon: HashIcon, label: "tag", prefix: "#" },
  { Icon: ArrowLeftIcon, label: "mentions of a note", prefix: "to:" },
  { Icon: ArrowRightIcon, label: "links from a note", prefix: "from:" },
  { Icon: TextSearchIcon, label: "phrase in prose", prefix: "mention:" },
  { Icon: LinkIcon, label: "link destination", prefix: "link:" },
];

export function PaletteFilters({
  onSelect,
  query,
}: {
  onSelect: (prefix: string) => void;
  query: string;
}) {
  return (
    <>
      <CommandEmpty>no matching filters</CommandEmpty>
      <CommandGroup heading="search by">
        {filters
          .filter(({ label, prefix }) =>
            `${label} ${prefix}`.includes(query.trim().toLowerCase())
          )
          .map(({ Icon, label, prefix }) => (
            <CommandItem key={prefix} onSelect={onSelect} value={prefix}>
              <Icon />
              <span className="flex-1">{label}</span>
              <span className="text-muted-foreground text-xs">{prefix}</span>
            </CommandItem>
          ))}
      </CommandGroup>
    </>
  );
}
