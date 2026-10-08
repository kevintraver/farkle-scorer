import type { FaceValue } from "@/lib/dice";
import { cn } from "@/lib/utils";

const PIPS: Record<FaceValue, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function DieFace({ value, small = false, muted = false }: { value: FaceValue; small?: boolean; muted?: boolean }) {
  return <span role="img" aria-label={`Die showing ${value}`} className={cn(
    "inline-grid shrink-0 grid-cols-3 grid-rows-3 place-items-center rounded-xl border border-stone-200 bg-white shadow-sm",
    small ? "size-9 gap-0.5 p-1.5" : "size-16 gap-1 p-3",
    muted && "opacity-40",
  )}>
    {Array.from({ length: 9 }, (_, position) => <span key={position} className={cn(
      "rounded-full",
      small ? "size-1" : "size-2",
      PIPS[value].includes(position) ? "bg-current" : "bg-transparent",
    )} />)}
  </span>;
}
