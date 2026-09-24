// Typed errors for admin write paths so controllers can answer 400/404/409 deterministically instead of a blanket 500.
export class MappingRequestError extends Error {
  /** @param {number} status HTTP status  @param {string} code stable machine code  @param {string} message  @param {object} [details] */
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'MappingRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isMappingRequestError = (e) => e instanceof MappingRequestError;

/** Standard error body used by the product-section write endpoints. */
export const errorBody = (e) => ({
  success: false,
  error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
});
