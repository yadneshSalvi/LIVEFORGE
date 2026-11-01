import type { ReactNode } from "react";

export function StatusChip({
  children,
  variant = "neutral",
  className = "",
}: {
  children: ReactNode;
  variant?: "neutral" | "good" | "warm";
  className?: string;
}) {
  return (
    <span
      className={`chip status-chip status-chip--${variant} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
