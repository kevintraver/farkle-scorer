"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import type { ReactNode } from "react";

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return <Collapsible.Root className="rounded-2xl border border-stone-200 bg-white">
    <Collapsible.Trigger className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-sm font-semibold">
      {title}
      <span aria-hidden="true" className="text-stone-400 group-data-[state=open]:hidden">+</span>
      <span aria-hidden="true" className="hidden text-stone-400 group-data-[state=open]:block">−</span>
    </Collapsible.Trigger>
    <Collapsible.Content className="border-t border-stone-100 p-5">{children}</Collapsible.Content>
  </Collapsible.Root>;
}
