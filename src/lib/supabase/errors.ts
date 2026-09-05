type SupabaseError = {
  code?: string;
  message: string;
};

/**
 * Turn an unexpected database failure into an exception that the nearest
 * Next.js error boundary can present to the user. A missing row is handled by
 * the page itself as a regular 404, so callers can explicitly allow PGRST116.
 */
export function throwIfSupabaseError(
  error: SupabaseError | null,
  context: string,
  allowedCodes: readonly string[] = [],
) {
  if (!error || (error.code && allowedCodes.includes(error.code))) return;

  throw new Error(`${context}: ${error.message}`);
}
