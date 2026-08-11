/**
 * Id minting, kept apart from `db/queries` so the client can use it too.
 *
 * A new chat's id is generated in the browser — see `components/chat-page.tsx`
 * — and importing it from the queries module would pull `node-postgres` into
 * the client bundle along with it.
 */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
