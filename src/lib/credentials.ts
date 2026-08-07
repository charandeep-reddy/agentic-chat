/**
 * Validation shared by the sign-in form and the server. Better Auth enforces
 * its own limits and would reject bad input anyway, but its errors arrive after
 * a round trip and read like API errors; these run on keystroke and say what to
 * fix. The bounds must stay in sync with `emailAndPassword` in `lib/auth.ts`.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_NAME_LENGTH = 80;

/**
 * Deliberately permissive. Anything stricter rejects addresses that are valid
 * in practice, and only delivery can really prove an address exists.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Enter your email address.";
  if (!EMAIL.test(trimmed)) return "That doesn't look like an email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be under ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name — it's what the assistant calls you.";
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `Name must be under ${MAX_NAME_LENGTH} characters.`;
  }
  return null;
}

/**
 * Better Auth returns a machine-readable code alongside its message. Only the
 * cases a user can act on are rewritten; anything else keeps the original text
 * rather than being flattened into a useless "something went wrong".
 */
export function authErrorMessage(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match an account.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account already exists for that email. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "PASSWORD_TOO_LONG":
      return `Password must be under ${MAX_PASSWORD_LENGTH} characters.`;
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email address before signing in.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}
