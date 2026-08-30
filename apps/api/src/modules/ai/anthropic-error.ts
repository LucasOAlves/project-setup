import { AppError, malformedAiOutput, providerUnavailable } from "../../app-error.js";

export function mapAnthropicError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const status = (error as { status?: number }).status;
  if (status === 401 || status === 403) {
    return providerUnavailable(
      "The text generation provider rejected the credentials.",
      502,
    );
  }
  if (status === 429) {
    return providerUnavailable(
      "The text generation provider is rate-limited. Retry in a moment.",
      503,
    );
  }
  if (status === 400) {
    return malformedAiOutput("The text generation provider rejected the request.");
  }

  return providerUnavailable("The text generation provider is unavailable.");
}
