import { makeBreaker } from './circuit-breaker.js';
import { withRetry, withTimeout } from './retry.js';

export type DispatchEvent = {
  eventType: string;
  clientPayload?: Record<string, unknown>;
};

export interface GitHubDispatchClient {
  triggerEvent(event: DispatchEvent): Promise<void>;
}

export class FakeGitHubDispatchClient implements GitHubDispatchClient {
  public events: DispatchEvent[] = [];
  async triggerEvent(event: DispatchEvent): Promise<void> {
    this.events.push(event);
  }
}

export class RealGitHubDispatchClient implements GitHubDispatchClient {
  private readonly fireBreaker: (event: DispatchEvent) => Promise<void>;

  constructor(private readonly opts: { token: string; owner: string; repo: string }) {
    const inner = (event: DispatchEvent) => this._send(event);
    this.fireBreaker = makeBreaker(inner, {
      timeoutMs: 5_000,
      errorThresholdPercentage: 50,
      resetTimeoutMs: 60_000,
    });
  }

  async triggerEvent(event: DispatchEvent): Promise<void> {
    return withRetry(() => this.fireBreaker(event), {
      attempts: 2,
      baseDelayMs: 500,
    });
  }

  private async _send(event: DispatchEvent): Promise<void> {
    const url = `https://api.github.com/repos/${this.opts.owner}/${this.opts.repo}/dispatches`;
    const body = JSON.stringify({
      event_type: event.eventType,
      client_payload: event.clientPayload ?? {},
    });
    const response = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.opts.token}`,
          'x-github-api-version': '2022-11-28',
          'content-type': 'application/json',
        },
        body,
      }),
      5_000,
    );
    if (!response.ok) {
      throw new Error(`GitHub dispatch failed: ${response.status} ${await response.text()}`);
    }
  }
}

export function createGitHubDispatchClient(): GitHubDispatchClient {
  if (process.env.NODE_ENV === 'test') {
    return new FakeGitHubDispatchClient();
  }
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO;
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set');
  }
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    throw new Error('GITHUB_DISPATCH_REPO must be in "owner/repo" format');
  }
  return new RealGitHubDispatchClient({ token, owner, repo: repoName });
}
