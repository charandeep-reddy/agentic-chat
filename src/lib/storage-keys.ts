export const KEY_STORAGE = "agentic-chat.key";
export const MODEL_STORAGE = "agentic-chat.model";

/** Which provider the next request goes to. See `lib/providers.ts`. */
export const PROVIDER_STORAGE = "agentic-chat.provider";

/**
 * The default provider, duplicated from `lib/providers.ts`.
 *
 * It lives here as a bare string because `scopedKey` and the pre-paint script
 * below both need it, and neither can import the catalogue: the script is
 * serialised into `<head>` as text, and importing the catalogue here would make
 * the dependency circular.
 */
const DEFAULT_PROVIDER_ID = "custom";

/**
 * Where one provider's key or model is stored.
 *
 * The default provider deliberately keeps the unsuffixed name. Browsers that
 * stored a key before this app knew about providers still find it, so nobody
 * has to paste their key again after the upgrade.
 */
export function scopedKey(base: string, provider: string): string {
  return provider && provider !== DEFAULT_PROVIDER_ID ? `${base}.${provider}` : base;
}

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
 * It reads the *selected* provider's key rather than any key, because that is
 * the one the next message will be sent with — someone holding an OpenAI key
 * while Anthropic is selected genuinely cannot send yet, and the header should
 * say so rather than claim a connection.
 *
 * Deliberately small and total: any throw (Safari private mode denying
 * localStorage) must leave the document in the no-key state, which is the
 * honest default rather than a broken one.
 */
export const HAS_KEY_INIT_SCRIPT = `(function(){try{
var p=localStorage.getItem(${JSON.stringify(PROVIDER_STORAGE)})||${JSON.stringify(DEFAULT_PROVIDER_ID)};
var k=${JSON.stringify(KEY_STORAGE)};
if(localStorage.getItem(p===${JSON.stringify(DEFAULT_PROVIDER_ID)}?k:k+"."+p))document.documentElement.setAttribute("data-has-key","");
}catch(e){}})();`;
