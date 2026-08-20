import { ERROR_CODES, type ErrorCode } from "@studio/shared";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(message: string): AppError {
  return new AppError(ERROR_CODES.VALIDATION, message, 400);
}

export function notFound(message: string): AppError {
  return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
}

export function providerUnavailable(message: string, statusCode = 503): AppError {
  return new AppError(ERROR_CODES.PROVIDER_UNAVAILABLE, message, statusCode);
}

export function malformedAiOutput(
  message = "The model returned data that could not be used.",
): AppError {
  return new AppError(ERROR_CODES.MALFORMED_AI_OUTPUT, message, 422);
}
