import { BroadcastView } from "@/components/BroadcastView";
export const metadata = { title: "Broadcast projector" };
export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  return <BroadcastView showId={show || ""} />;
}
