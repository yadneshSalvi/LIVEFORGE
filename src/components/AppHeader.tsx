"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { Brand } from "./Brand";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="app-header">
      <div className="header-brand">
        <Brand />
      </div>
      <nav className="main-nav" aria-label="Main navigation">
        <Link className={pathname === "/studio" ? "active" : ""} href="/studio">
          Studio
        </Link>
        <Link
          className={pathname === "/archive" ? "active" : ""}
          href="/archive"
        >
          Archive
        </Link>
        <Link className={pathname === "/guide" ? "active" : ""} href="/guide">
          <CircleHelp size={15} /> Guide
        </Link>
      </nav>
      <div className="header-actions">
        {children || (
          <Link className="button button-small button-outline" href="/studio">
            Start a show <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </header>
  );
}
