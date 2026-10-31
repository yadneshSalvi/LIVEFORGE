import { OverlayBoard } from "@/components/OverlayBoard";

export const metadata = { title: "Public broadcast overlay" };

export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ showId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ showId }, query] = await Promise.all([params, searchParams]);
  return <OverlayBoard showId={showId} previewMode={query.preview === "1"} />;
}
