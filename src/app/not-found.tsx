import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
export default function NotFound() {
  return (
    <div>
      <AppHeader />
      <main className="guide-main">
        <div className="archive-empty">
          <Compass size={38} strokeWidth={1.2} />
          <p className="eyebrow">UNMAPPED TERRITORY / 404</p>
          <h1>
            This part of the sky
            <br />
            hasn’t been forged.
          </h1>
          <p>
            The page could not be found. Your saved show is waiting in the
            studio.
          </p>
          <Link className="button button-primary" href="/studio">
            Find your way back
            <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    </div>
  );
}
