import Anthropic from '@anthropic-ai/sdk';
import { makeBreaker } from './circuit-breaker.js';
import { withRetry } from './retry.js';

export type WikiIndexEntry = {
  category: string;
  slug: string;
  name: string;
  aliases: string[];
};
export type WikiIndex = WikiIndexEntry[];

export type AnnotateInput = {
  chapterText: string;
  wikiIndex: WikiIndex;
  policy: 'first-mention-per-chapter' | 'first-mention-per-section' | 'every-mention';
};

export type AnnotateResult = {
  annotatedText: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
};

export interface ClaudeClient {
  annotateChapter(input: AnnotateInput): Promise<AnnotateResult>;
}

export class FakeClaudeClient implements ClaudeClient {
  public calls: AnnotateInput[] = [];
  constructor(private response: { annotatedText: string; tokensIn?: number; tokensOut?: number; model?: string }) {}

  async annotateChapter(input: AnnotateInput): Promise<AnnotateResult> {
    this.calls.push(input);
    return {
      annotatedText: this.response.annotatedText,
      tokensIn: this.response.tokensIn ?? 0,
      tokensOut: this.response.tokensOut ?? 0,
      model: this.response.model ?? 'fake-model',
    };
  }
}

export class AnthropicClaudeClient implements ClaudeClient {
  private readonly anthropic: Anthropic;
  private readonly fireBreaker: (input: AnnotateInput) => Promise<AnnotateResult>;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.anthropic = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'claude-3-7-sonnet-latest';
    const inner = (input: AnnotateInput) => this._call(input);
    this.fireBreaker = makeBreaker(inner, {
      timeoutMs: 60_000,
      errorThresholdPercentage: 50,
      resetTimeoutMs: 30_000,
    });
  }

  async annotateChapter(input: AnnotateInput): Promise<AnnotateResult> {
    return withRetry(() => this.fireBreaker(input), {
      attempts: 2,
      baseDelayMs: 500,
      shouldRetry: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        return /5\d\d|timeout|network/i.test(msg);
      },
    });
  }

  private async _call(input: AnnotateInput): Promise<AnnotateResult> {
    const system = buildSystemPrompt();
    const user = buildUserPrompt(input);
    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 16_000,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no text content');
    }
    return {
      annotatedText: extractAnnotatedChapter(textBlock.text),
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      model: response.model,
    };
  }
}

function buildSystemPrompt(): string {
  return `You are an editor for the Lore Universe website. Your job is to insert {category|slug|display} wiki link tokens into chapter prose.

Rules:
- Only link names that appear in the wiki index provided.
- Apply the policy specified in the user prompt for how many links to insert.
- Preserve the chapter text exactly except for inserting tokens — no rewriting, no formatting changes.
- Output ONLY the annotated chapter wrapped in <annotated> tags. Nothing else.`;
}

function buildUserPrompt(input: AnnotateInput): string {
  return `Wiki index (JSON):
${JSON.stringify(input.wikiIndex, null, 2)}

Linking policy: ${input.policy}

Chapter:
<chapter>
${input.chapterText}
</chapter>`;
}

function extractAnnotatedChapter(raw: string): string {
  const match = raw.match(/<annotated>([\s\S]*?)<\/annotated>/);
  if (match) return match[1].trim();
  return raw.trim();
}

export function createClaudeClient(): ClaudeClient {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Tests must inject a FakeClaudeClient directly');
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required to call Claude');
  }
  return new AnthropicClaudeClient({ apiKey: key });
}
