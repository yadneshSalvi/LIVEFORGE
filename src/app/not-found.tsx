import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
export default function NotFound() {
  return (
    <div>
      <AppHeader />
      <main className="guide-main">
        <div className="archive-empty">
          <h1>Page not found.</h1>
          <Link className="button button-primary" href="/studio">
            Return to Studio
          </Link>
        </div>
      </main>
    </div>
  );
}
