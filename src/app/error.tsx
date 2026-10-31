"use client";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="guide-main">
      <div className="archive-empty">
        <RotateCcw size={34} />
        <p className="eyebrow">A MOMENT TO RECOVER</p>
        <h1>
          The foundry needs
          <br />a second chance.
        </h1>
        <p>
          This view could not finish loading. Your last acknowledged checkpoint
          remains saved.
        </p>
        <button className="button button-primary" onClick={reset}>
          Try this view again
        </button>
        <Link className="button button-outline" href="/studio">
          Return to the studio
        </Link>
      </div>
    </main>
  );
}
