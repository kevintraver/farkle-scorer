# Farkle photo playground

Upload a photo of 1–6 regular dice, inspect the segmented crops and recognized faces, and calculate the highest Farkle score for that roll. Dice values are editable and corrections rescore immediately. Colors have no effect.

## Run locally

Use Node.js 22 or newer and pnpm.

```sh
pnpm install
```

Create `.env` in the project root using `.env.example` as the template. If you already have `.env`, keep its existing key and add the Meta key:

```dotenv
OPENAI_API_KEY=your-openai-key
MODEL_API_KEY=your-meta-model-api-key
```

`MODEL_API_KEY` is a **Meta** credential, following Meta's environment-variable naming. Obtain it through the [Meta Model API dashboard](https://dev.meta.ai/). Your Meta account needs `sam-3.1` access, and your OpenAI project needs the Decisions API and `gpt-6-luna`. Both keys stay on the server; `.env` is ignored by Git. Dependencies include Meta's official `@meta-sam/parser` and `sharp` for image processing.

When ready, start the app:

```sh
pnpm dev
```

Open <http://localhost:3000>. Restart the app after changing environment variables. If you run the project through d3k, use that existing dev server and `d3k errors --context` for diagnostics instead of starting another server.

## How recognition works

`POST /api/analyze` accepts a multipart field named `image` (JPEG, PNG, or WebP, up to 10 MiB after browser resizing). You can select larger original photos; the browser reduces them before sending.

1. Before upload, the browser resizes photos wider or taller than 2,048 pixels, or files over 10 MiB, to fit within 2,048 × 2,048 without upscaling. It preserves proportions and EXIF orientation, flattens transparency onto white, and encodes resized photos as JPEG at 90% quality. Smaller photos pass through unchanged. The preview keeps the original photo, and the upload size and dimensions appear when resizing occurs.
2. The server also normalizes orientation, strips metadata, flattens transparency, and enforces the 2,048-pixel limit before segmentation.
3. The normalized photo goes to [Meta SAM 3.1](https://dev.meta.ai/docs/sam/overview) at `https://api.meta.ai/v1/responses`, with the exact text prompt **`dice`** and `metadata.mask_encoding: "one_bit"`.
4. The official [Meta parser](https://dev.meta.ai/docs/sam/client-libraries) decodes the streamed object masks. Each mask isolates one die: pixels outside it become white, then the object is cropped, padded, and limited to 512 pixels. The server uses the mask's half-open bounds from the parser.
5. Each die goes to [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions) in its own request with two images: the isolated die first, then a wider crop from the original normalized photo. The wider crop adds half the die’s longest dimension on every side (clamped at photo edges), preserves the background and shadows, marks the target with a cyan rectangle, and fits within 768 × 768 pixels without upscaling. One `top_face` question asks: **“What number is on the upward-facing top face of this die?”** Choices are `1`–`6`, `unclear`, and `not_a_die`. The instructions use both views to determine orientation, ignore neighboring dice and side-face pips, and prohibit inferring hidden faces.
6. Code calculates the highest legal Farkle score. The UI shows numbered boxes on the original photo, the actual masked crops sent to OpenAI, editable values, and scoring groups. Add a missed die or remove a false detection without another API call.

One valid roll uses one SAM request plus 1–6 Decisions requests, with crop reads running concurrently. SAM finds objects; it does not read pips or score Farkle. Its masks can miss dice, combine touching dice, or include false detections. Compare the crops with the original photo; recognition quality still needs real-photo testing.

An unclear, refused, or failed crop keeps its image and has no guessed value. The roll has **no score** until you correct/remove unresolved crops and confirm the entered dice. Zero or more than six SAM matches skip Decisions and offer manual entry; detections are never silently truncated. A broken or incomplete SAM response fails the request instead of scoring a partial roll. Readable faces with confidence below 0.8 are flagged for review; this threshold is experimental, not a calibrated accuracy guarantee.

The response includes `segmentation` (isolated and context crop data URLs, bounds, source dimensions, detection count, timing, and warnings), `recognition`, `score` (or `null`), and `diagnostics` (per-crop Decisions responses and timing). The collapsed API details panel exposes both prompts, both images sent for each die, per-crop confidence/probabilities, and combined Decisions token usage. Mask payloads and both image payloads are omitted from the diagnostic JSON view.

Photos go to Meta; individual masked crops and their surrounding photo context go to OpenAI. This app holds photos and results only in memory and does not log their contents or credentials. Both providers' API usage and data policies apply. Exact prompts live in `src/lib/segmentation-types.ts` and `src/lib/recognition.ts`; image processing lives in `src/lib/segmentation.ts`.

## Scoring

The pure `scoreRoll` function evaluates disjoint scoring subsets of the roll and chooses the highest total. Each die is used at most once. It returns the score, scoring groups, unscored dice, and `isFarkle`.

| Combination | Points |
| --- | ---: |
| Single 1 / single 5 | 100 / 50 |
| Three 1s | 300 |
| Three 2s / 3s / 4s / 5s / 6s | 200 / 300 / 400 / 500 / 600 |
| Four / five / six of a kind | 1,000 / 2,000 / 3,000 |
| Straight 1–6 | 1,500 |
| Three pairs | 1,500 |
| Four of a kind + a pair | 1,500 |
| Two triplets | 2,500 |

For example, `[2,2,2,1,5,6]` scores **350**. `[2,2,3,3,4,6]` is a **Farkle (0)**. Rules vary between Farkle versions; this prototype uses the agreed 300-point triple-1 rules without spicy bonuses.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
```

Vitest covers scoring, mask decoding and pixel-level cropping, EXIF orientation, incomplete segmentation, per-crop recognition, provider failures, and the upload/correction UI in jsdom. Route tests use the real SDK and Meta parser with mocked HTTP/SSE responses. Tests do not call either provider or require real keys. Real-photo recognition quality needs to be checked with actual uploads; mocked tests cannot establish it.

Browser verification uses `agent-browser` against a server you have started. There is no saved game, player tracking, reroll state, red-pip bonus, authentication, or deployment configuration in this prototype.
