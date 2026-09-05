import { notFound } from "next/navigation";
import { ToolWorkspace } from "@/components/tool-workspace";
import { getTool, TOOLS } from "@/lib/tool-definitions";

export function generateStaticParams() {
  return TOOLS.map((tool) => ({ slug: tool.slug }));
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  return <ToolWorkspace toolSlug={tool.slug} />;
}
