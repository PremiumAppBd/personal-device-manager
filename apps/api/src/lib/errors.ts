import { ERROR_STATUS, type ApiErrorCode } from "@pdm/shared";

/** A typed API error that maps to a consistent response + HTTP status. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Array<{ path: string; message: string }>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export const errors = {
  badRequest: (m = "Bad request") => new ApiError("bad_request", m),
  unauthorized: (m = "Authentication required") =>
    new ApiError("unauthorized", m),
  forbidden: (m = "Not permitted") => new ApiError("forbidden", m),
  notFound: (m = "Not found") => new ApiError("not_found", m),
  conflict: (m = "Conflict") => new ApiError("conflict", m),
  replay: (m = "Request nonce already used") =>
    new ApiError("replay_detected", m),
  signature: (m = "Signature verification failed") =>
    new ApiError("signature_invalid", m),
  pairing: (m = "Invalid or expired pairing code") =>
    new ApiError("pairing_invalid", m),
  featureDisabled: (m = "Feature not enabled in this phase") =>
    new ApiError("feature_disabled", m),
  internal: (m = "Internal error") => new ApiError("internal_error", m),
};
