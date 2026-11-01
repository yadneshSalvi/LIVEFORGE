"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="guide-main">
      <div className="archive-empty">
        <h1>This view could not load.</h1>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
