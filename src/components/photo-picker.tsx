import { useId } from "react";
import { Button } from "./button";

export function PhotoPicker({ camera = false, children, onSelect }: {
  camera?: boolean;
  children: string;
  onSelect: (file: File) => void;
}) {
  const id = useId();
  // iOS Safari only opens the camera from a real tap, so the label activates the input natively.
  return <>
    <input
      id={id}
      type="file"
      accept="image/*"
      capture={camera ? "environment" : undefined}
      aria-label={camera ? "Take a dice photo" : "Upload a dice photo"}
      className="peer sr-only"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        // Clear after reading so choosing the same photo again still fires change.
        event.currentTarget.value = "";
        if (file) onSelect(file);
      }}
    />
    <Button asChild variant="secondary" className="cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-teal-700">
      <label htmlFor={id}>{children}</label>
    </Button>
  </>;
}
