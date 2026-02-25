#!/usr/bin/env node
import 'dotenv/config';

const provider = (process.env.LLM_PROVIDER || 'fake').toLowerCase();

function fail(msg){
  console.error(msg);
  process.exit(1);
}

if (provider === 'claude') {
  if (!process.env.ANTHROPIC_API_KEY) fail('Missing ANTHROPIC_API_KEY in .env');
  console.log('Claude config looks ready ✅');
  process.exit(0);
}

if (provider === 'gemini') {
  if (!process.env.GEMINI_API_KEY) fail('Missing GEMINI_API_KEY in .env');
  console.log('Gemini config looks ready ✅');
  process.exit(0);
}

console.log('LLM_PROVIDER=fake (offline mode) ✅');
