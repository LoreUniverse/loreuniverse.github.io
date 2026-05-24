#!/usr/bin/env node
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const usage = `Usage: node scripts/autolink.js <chapter-file> [--policy=<policy>]

Reads a chapter markdown file, calls the backend's /api/admin/autolink endpoint,
and writes the annotated chapter to <chapter-file>.autolinked.md alongside.

Required env vars (in .env or shell):
  LORE_API_URL       - Backend URL (e.g. https://loreuniverse-api.fly.dev)
  LORE_API_TOKEN     - Admin token (lore_admin_...)

Policy options: first-mention-per-chapter | first-mention-per-section | every-mention
Default policy: first-mention-per-section
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }

  const inputFile = args[0];
  const policyArg = args.find(a => a.startsWith('--policy='));
  const policy = policyArg ? policyArg.split('=')[1] : 'first-mention-per-section';

  const url = process.env.LORE_API_URL;
  const token = process.env.LORE_API_TOKEN;
  if (!url || !token) {
    console.error('LORE_API_URL and LORE_API_TOKEN must be set in environment.');
    process.exit(1);
  }

  const chapterText = await readFile(inputFile, 'utf-8');
  console.log(`Annotating ${inputFile} (${chapterText.length} chars) with policy "${policy}"...`);

  const response = await fetch(`${url}/api/admin/autolink`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ chapterText, policy }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`API call failed: ${response.status} ${text}`);
    process.exit(1);
  }

  const body = await response.json();
  const outputFile = inputFile.replace(/\.md$/, '.autolinked.md');
  await writeFile(outputFile, body.annotatedText, 'utf-8');

  console.log(`Wrote ${outputFile}`);
  console.log(`Usage: model=${body.usage.model} tokens_in=${body.usage.tokensIn} tokens_out=${body.usage.tokensOut}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
