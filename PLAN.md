# Regular-dice Farkle photo prototype

## Agreed behavior

- Choose a photo or take one with the rear camera through native file inputs, including on iOS Safari. Support JPEG, PNG, WebP, and browser-decodable HEIC/HEIF photos of one roll containing 1–6 dice. Convert HEIC/HEIF to JPEG before upload; resize photos exceeding 2,048 pixels on either edge or 10 MiB, preserving proportions and orientation. Leave smaller JPEG/PNG/WebP photos unchanged and show the prepared dimensions and upload size.
- Normalize the photo and send it to Meta SAM 3.1 with the prompt `dice`. Decode the masks with Meta’s official parser, isolate each die on white, and generate padded crops.
- Send two images per die in each OpenAI Decisions (`gpt-6-luna`) request: the isolated die and a wider original-photo crop with the target outlined in cyan. Expand the context by half the die’s longest dimension on each side, clamp to the photo, and limit it to 768 pixels. Ask one top-face question: 1–6, unclear, or not_a_die. Use the surroundings to interpret orientation; ignore neighboring dice, colors, and side-face pips.
- Show numbered locations, masked crops, and editable face values. Allow adding missed dice and removing false detections. Keep unreadable crops visible with an unset value.
- Calculate the highest legal score in code. Manual edits never require another API call.
- Show the score, scoring groups, unused dice, and a Farkle indication for valid zero-point rolls.
- Keep original API results, probabilities, confidence, timing, usage, exact prompts, and both images sent per die in a collapsed details panel.
- Require manual correction for unresolved crops. Zero or more than six segments skip classification and offer manual entry; incomplete or malformed segmentation fails instead of scoring partial results. Flag face-reading confidence below 0.8 for review.

## Rules

Single 1 = 100; single 5 = 50; three 1s = 300; other triples = face × 100; four/five/six of a kind = 1,000/2,000/3,000; straight = 1,500; three pairs or four of a kind with a pair = 1,500; two triplets = 2,500. No die may count twice.

## Architecture

Next.js App Router, TypeScript, pnpm, the official OpenAI SDK, `@meta-sam/parser`, Sharp, and Vitest. `POST /api/analyze` accepts one multipart image and returns segmentation/crops, recognition, optional score, and diagnostics. `OPENAI_API_KEY` and Meta’s `MODEL_API_KEY` are server-only. App data stays in memory.

Exact prompts are maintained in `src/lib/segmentation-types.ts` and `src/lib/recognition.ts`. The normalized photo goes to Meta, and each masked crop plus its wider context crop goes to OpenAI.

## Validation

Test scoring combinations, optimal grouping, order independence, mask application, EXIF rotation, streamed segmentation parsing, per-crop response parsing, invalid uploads, upstream errors, manual correction, and replacing a photo while analysis is running. Run type checking and a production build. Verify actual recognition using real photos separately from mocked tests.

Use agent-browser for browser checks. Start the dev server only when requested; use d3k diagnostics if it manages the app.

## Out of scope

Spicy bonuses, camera streaming, players, full turns, rerolls, persistent history, authentication, and deployment.
