import TeamView from "@/components/TeamView";

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TeamView code={code.toUpperCase()} />;
}
