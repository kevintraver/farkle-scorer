import sharp from "sharp";

// Complete lossless mask from Meta's documented wire-format example (27 × 60).
// https://dev.meta.ai/docs/sam/reading-segmentation
export const MASK_PAYLOAD = "~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(";

export function samText(count = 6) {
  return count === 0 ? "" : "<0f>" + Array.from({ length: count }, (_, index) => {
    const left = index * 70;
    return `${index}<|box;x1=${left};y1=10;x2=${left + 59};y2=36;w=512;h=128|><|mask;x=0;y=0;data=27,60,${MASK_PAYLOAD}|>`;
  }).join(",");
}

export function samStream(text = samText(), terminal = "response.completed") {
  const lane = { item_id: "sam-message", output_index: 0, content_index: 0 };
  const events = [
    { type: "response.output_text.delta", ...lane, delta: text.slice(0, 19) },
    { type: "response.output_text.delta", ...lane, delta: text.slice(19) },
    { type: "response.content_part.done", ...lane, part: { type: "output_text", text } },
    ...(terminal ? [{ type: terminal, response: {} }] : []),
  ];
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}

export async function photoBytes() {
  return sharp({ create: { width: 512, height: 128, channels: 3, background: { r: 30, g: 60, b: 90 } } }).png().toBuffer();
}
