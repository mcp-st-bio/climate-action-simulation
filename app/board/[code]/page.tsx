import BoardView from "@/components/BoardView";

export default async function BoardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <BoardView code={code.toUpperCase()} />;
}
