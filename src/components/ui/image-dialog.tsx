import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageDialogProps {
  alt: string;
  onClosed: () => void;
  src: string;
  width: number;
}

/** Shows one image at `width` or the window's size, whichever is smaller. It opens on mount and reports once its close has played. */
function ImageDialog({ alt, onClosed, src, width }: ImageDialogProps) {
  return (
    <Dialog
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) {
          onClosed();
        }
      }}
    >
      <DialogContent
        className="w-auto max-w-[calc(100vw-4rem)] bg-transparent p-0 shadow-none ring-0"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{alt === "" ? "image" : alt}</DialogTitle>
        </DialogHeader>
        <img
          alt={alt}
          className="max-h-[calc(100vh-4rem)] max-w-[min(var(--image-width),calc(100vw-4rem))] rounded-md"
          src={src}
          style={{ "--image-width": `${width}px` }}
        />
      </DialogContent>
    </Dialog>
  );
}

export { ImageDialog };
