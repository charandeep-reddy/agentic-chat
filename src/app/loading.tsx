import { ChatSkeleton } from "@/components/skeleton";

/**
 * Fallback for the new-chat route. Nested routes that need something different
 * — /profile, /memory, /sign-in — declare their own alongside their page.
 */
export default function Loading() {
  return <ChatSkeleton empty />;
}
