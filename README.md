# Farkle Scorer

A simple playground for scoring a photo of 1–6 regular dice. Take a photo or upload one, check the recognized values and confidence, and correct any mistakes to recalculate the score.

Built with Next.js, React, TypeScript, and Sharp.

## How it works

1. Meta SAM 3.1 finds and separates the dice.
2. OpenAI Decisions (`gpt-6-luna`) reads each die using its isolated image and a wider context crop. Requests run in parallel.
3. Code calculates the highest Farkle score for the roll.

Large photos resize automatically. Browser-supported HEIC photos convert to JPEG. Photos are sent to Meta and OpenAI; the app does not save them.

## Run locally

Requires Node.js 24+ and pnpm, plus access to Meta SAM 3.1 and OpenAI Decisions.

```sh
pnpm install
```

Create `.env` using [`.env.example`](.env.example) and add your keys:

```dotenv
OPENAI_API_KEY=your-openai-key
MODEL_API_KEY=your-meta-key
```

Keys stay on the server, and `.env` is ignored by Git.

```sh
pnpm dev
```

Open [localhost:3000](http://localhost:3000). To test on your phone, use your computer's LAN address on the same network.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
```

This is a single-roll prototype, without full game tracking. See [PLAN.md](PLAN.md) for scoring rules and implementation details.
