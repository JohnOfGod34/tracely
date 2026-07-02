import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LivePageClient from "./LivePageContent";
import { getInitialSpans, getProject } from "@/lib/metadata";

interface PageProps {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug, projectSlug } = await params;
  const project = await getProject(orgSlug, projectSlug);
  return {
    title: `${project?.name ?? projectSlug} Live`,
  };
}

export default async function LivePage({ params }: PageProps) {
  const { orgSlug, projectSlug } = await params;

  const [project, initialData] = await Promise.all([
    getProject(orgSlug, projectSlug),
    getInitialSpans(orgSlug, projectSlug),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <LivePageClient
      orgSlug={orgSlug}
      projectSlug={projectSlug}
      projectId={project.id}
      initialSpans={initialData.spans}
      initialHasMoreHistory={initialData.hasMore}
    />
  );
}
