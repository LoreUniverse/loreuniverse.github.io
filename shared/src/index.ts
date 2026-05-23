// Shared types used by both backend and (eventually) frontend.
// Real types added as features land in later plans.

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
