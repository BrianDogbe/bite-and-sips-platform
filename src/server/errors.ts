/**
 * Domain errors carry a stable machine code and an HTTP status.
 * Messages are written to be safe to show to the person who triggered them.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (what = 'Record') => new DomainError('not_found', `${what} not found.`, 404);
export const forbidden = (msg = 'You do not have permission to do that.') => new DomainError('forbidden', msg, 403);
export const unauthenticated = () => new DomainError('unauthenticated', 'Please sign in to continue.', 401);
export const conflict = (msg: string, details?: unknown) => new DomainError('conflict', msg, 409, details);
export const invalid = (msg: string, details?: unknown) => new DomainError('invalid', msg, 422, details);
export const rateLimited = () => new DomainError('rate_limited', 'Too many attempts. Please wait a few minutes and try again.', 429);

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
