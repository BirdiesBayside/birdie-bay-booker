import { FunctionsHttpError } from "@supabase/supabase-js";

export interface EdgeFunctionError {
  /** Human readable message, already friendly where the backend provided one */
  message: string;
  /** Machine readable code from the backend, when present (e.g. card_declined) */
  code?: string;
  /** Raw parsed body, if it was JSON */
  body?: any;
}

const CARD_ERROR_CODES = new Set([
  "card_declined",
  "expired_card",
  "insufficient_funds",
  "incorrect_cvc",
  "incorrect_number",
  "processing_error",
  "authentication_required",
  "card_error",
]);

/**
 * supabase.functions.invoke reports every non-2xx as the generic
 * "Edge Function returned a non-2xx status code". This reads the real body so
 * the backend's friendly message reaches the customer.
 */
export async function parseFunctionError(error: unknown): Promise<EdgeFunctionError> {
  const fallback = (error as any)?.message || "Something went wrong. Please try again.";

  if (error instanceof FunctionsHttpError) {
    try {
      const text = await error.context.text();
      if (text) {
        try {
          const body = JSON.parse(text);
          return {
            message: body?.error || body?.message || fallback,
            code: body?.code,
            body,
          };
        } catch {
          return { message: text };
        }
      }
    } catch {
      // fall through to generic message
    }
  }

  return { message: fallback };
}

export function isCardError(parsed: EdgeFunctionError): boolean {
  return !!parsed.code && CARD_ERROR_CODES.has(parsed.code);
}
