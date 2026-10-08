import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Button({ asChild = false, variant = "primary", className, ...props }: ComponentProps<"button"> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "quiet";
}) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45",
    variant === "primary" && "bg-teal-800 text-white hover:bg-teal-900",
    variant === "secondary" && "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
    variant === "quiet" && "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
    className,
  )} {...props} />;
}
