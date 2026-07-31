import HostConsole from "@/components/HostConsole";

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <HostConsole code={code.toUpperCase()} />;
}
