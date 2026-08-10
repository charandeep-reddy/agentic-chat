import { requireUser } from "@/lib/session";
import { listDocuments } from "@/lib/rag/store";
import { DocumentsPage } from "@/components/documents-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents · Agentic Chat" };

export default async function Documents() {
  const user = await requireUser();
  const documents = await listDocuments(user.id);

  return (
    <DocumentsPage
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      documents={documents.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))}
    />
  );
}
