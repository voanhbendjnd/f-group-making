/**
 * Standard API error structure normalized across backend variations
 */
export interface ApiError {
  status: number;
  message: string;
  errorKey?: string;
  detail?: string;
  violations?: Array<{ field: string; message: string }>;
  raw?: unknown;
  outcomeUnknown?: boolean;
}

export function getApiError(value: unknown): ApiError {
  if (typeof value === 'object' && value !== null && 'status' in value && 'message' in value
      && typeof value.status === 'number' && typeof value.message === 'string') return value as ApiError;
  return { status: 0, message: '', outcomeUnknown: true };
}

/**
 * Standard backend wrapper from ResFormatResponse
 */
export interface RestResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  error?: string | null;
}
