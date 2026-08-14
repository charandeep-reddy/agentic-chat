import { createProject, listProjects } from "@/lib/db/queries";
import {
  MAX_PROJECT_DESCRIPTION,
  MAX_PROJECT_INSTRUCTIONS,
  MAX_PROJECT_NAME,
  normalizeField,
} from "@/lib/projects";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const projects = await listProjects(authed.user.id);
  return Response.json({ projects });
}

export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  let body: { name?: unknown; description?: unknown; instructions?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Unlike a chat, a project cannot be created blank: it is a thing the user
  // names, and an untitled one is indistinguishable from every other untitled
  // one in the picker.
  const name = normalizeField(body.name, MAX_PROJECT_NAME);
  if (!name) return Response.json({ error: "empty_name" }, { status: 400 });

  const project = await createProject(authed.user.id, {
    name,
    description: normalizeField(body.description, MAX_PROJECT_DESCRIPTION),
    instructions: normalizeField(body.instructions, MAX_PROJECT_INSTRUCTIONS),
  });

  return Response.json({ project }, { status: 201 });
}
