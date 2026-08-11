export const KEY_STORAGE = "agentic-chat.key";
export const MODEL_STORAGE = "agentic-chat.model";

/**
 * Marks on `<html>` whether a model key is present, before first paint.
 *
 * React cannot do this job, for the same reason it cannot pick the theme: the
 * server has no way to know, so `useSyncExternalStore` hands its *server*
 * snapshot to the hydration render as well. Every visitor therefore painted
 * "Add API key" in warning colours and the new-user onboarding block, then
 * swapped both a moment later once localStorage was read — a flash on every
 * refresh for anyone who had already connected a key.
 *
 * Reading it synchronously here means the first paint is already right. The
 * attribute drives visibility in CSS, so React's later catch-up changes
 * nothing on screen. `chat.tsx` keeps it in sync when the key is added or
 * removed at runtime.
 *
 * Deliberately small and total: any throw (Safari private mode denying
 * localStorage) must leave the document in the no-key state, which is the
 * honest default rather than a broken one.
 */
export const HAS_KEY_INIT_SCRIPT = `(function(){try{
if(localStorage.getItem(${JSON.stringify(KEY_STORAGE)}))document.documentElement.setAttribute("data-has-key","");
}catch(e){}})();`;
