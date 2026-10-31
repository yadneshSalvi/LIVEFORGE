import { CommunityBoard } from "@/components/CommunityBoard";
export const metadata = { title: "Community board" };
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  return <CommunityBoard showId={showId} />;
}
