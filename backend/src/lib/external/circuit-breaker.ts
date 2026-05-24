import CircuitBreaker from 'opossum';

export type BreakerOptions = {
  timeoutMs: number;
  errorThresholdPercentage: number;
  resetTimeoutMs: number;
};

export function makeBreaker<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: BreakerOptions,
): (...args: TArgs) => Promise<TResult> {
  const breaker = new CircuitBreaker(fn, {
    timeout: options.timeoutMs,
    errorThresholdPercentage: options.errorThresholdPercentage,
    resetTimeout: options.resetTimeoutMs,
  });
  return (...args: TArgs) => breaker.fire(...args) as Promise<TResult>;
}
