"use client";
import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Runs a server action (no form) with an optional confirm prompt. */
export function ActionButton({ action, confirm, children, ...props }: ButtonProps & { action: () => Promise<unknown>; confirm?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          try {
            await action();
          } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
          }
        });
      }}
    >
      {children}
    </Button>
  );
}
