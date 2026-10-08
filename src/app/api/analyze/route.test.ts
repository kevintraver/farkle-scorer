import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decisionFor } from "@/test/fixtures";
import { photoBytes, samStream, samText } from "@/test/sam-fixtures";
import { MAX_IMAGE_BYTES } from "@/lib/upload";
import { POST } from "./route";

async function upload(file?: File) {
  const form = new FormData();
  form.set("image", file ?? new File([new Uint8Array(await photoBytes())], "roll.png", { type: "image/png" }));
  return new Request("http://localhost/api/analyze", { method: "POST", body: form });
}

describe("POST /api/analyze", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-placeholder");
    vi.stubEnv("MODEL_API_KEY", "test-meta-placeholder");
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  function mockRoll(values: (string | number)[]) {
    fetchMock.mockResolvedValueOnce(samStream(samText(values.length)));
    for (const value of values) fetchMock.mockResolvedValueOnce(Response.json(decisionFor(value)));
  }

  it("calls Meta first, then pairs each isolated die with its own context in Decisions", async () => {
    mockRoll([2, 2, 2, 1, 5, 6]);
    const response = await POST(await upload());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, segmentation: { model: "sam-3.1", detectedCount: 6 }, recognition: { status: "ready" }, score: { total: 350 } });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.meta.ai/v1/responses");
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer test-meta-placeholder");
    const metaRequest = JSON.parse(String(options?.body));
    expect(metaRequest).toMatchObject({ model: "sam-3.1", stream: true, metadata: { mask_encoding: "one_bit" }, input: [{ content: [{ text: "dice" }, { type: "input_image" }] }] });
    for (const [index, [decisionUrl, decisionOptions]] of fetchMock.mock.calls.slice(1).entries()) {
      expect(String(decisionUrl)).toBe("https://api.openai.com/v1/decisions");
      expect(new Headers(decisionOptions?.headers).get("authorization")).toBe("Bearer test-openai-placeholder");
      const request = JSON.parse(String(decisionOptions?.body));
      expect(request.questions).toHaveLength(1);
      expect(request.questions[0].name).toBe("top_face");
      expect(request.input[0].content).toHaveLength(3);
      expect(request.input[0].content[1].image_url).toBe(body.segmentation.crops[index].imageUrl);
      expect(request.input[0].content[1].image_url).not.toBe(metaRequest.input[0].content[1].image_url);
      expect(request.input[0].content[2].image_url).toBe(body.segmentation.crops[index].contextImageUrl);
      expect(request.input[0].content[2].image_url).not.toBe(request.input[0].content[1].image_url);
      expect(request.input[0].content[2].image_url).not.toBe(metaRequest.input[0].content[1].image_url);
    }
  });

  it.each([0, 7])("returns no score and skips Decisions for %i matches", async (count) => {
    fetchMock.mockResolvedValueOnce(samStream(samText(count)));
    const response = await POST(await upload());
    expect(await response.json()).toMatchObject({ score: null, recognition: { status: "needs_correction" }, segmentation: { detectedCount: count } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an unreadable die from a valid zero-point Farkle", async () => {
    mockRoll([2, "unclear"]);
    expect(await (await POST(await upload())).json()).toMatchObject({ score: null, recognition: { dice: [{ value: 2 }, { value: null }] } });
    mockRoll([2, 2, 3, 3, 4, 6]);
    expect(await (await POST(await upload())).json()).toMatchObject({ score: { total: 0, isFarkle: true } });
  });

  it("preserves all crops and successful reads if one Decisions request fails", async () => {
    fetchMock.mockResolvedValueOnce(samStream(samText(2)));
    fetchMock.mockResolvedValueOnce(Response.json(decisionFor(5)));
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "private details" } }, { status: 429 }));
    const body = await (await POST(await upload())).json();
    expect(body).toMatchObject({ score: null, recognition: { dice: [{ value: 5 }, { value: null }] } });
    expect(body.segmentation.crops).toHaveLength(2);
    expect(body.recognition.issues[0]).toContain("OpenAI's usage limit");
    expect(JSON.stringify(body)).not.toContain("private details");
  });

  it("rejects missing, unsupported, empty, oversized, and corrupt files before any API call", async () => {
    const missing = new Request("http://localhost/api/analyze", { method: "POST", body: new FormData() });
    expect((await POST(missing)).status).toBe(400);
    for (const file of [new File(["text"], "roll.txt", { type: "text/plain" }), new File([], "empty.png", { type: "image/png" }), new File(["fake"], "fake.png", { type: "image/png" })]) {
      expect((await POST(await upload(file))).status).toBe(400);
    }
    expect((await POST(await upload(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" })))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed multipart requests", async () => {
    expect((await POST(new Request("http://localhost/api/analyze", { method: "POST", body: "not multipart" }))).status).toBe(400);
  });

  it.each(["OPENAI_API_KEY", "MODEL_API_KEY"])("explains missing %s without network calls", async (key) => {
    vi.stubEnv(key, "");
    const response = await POST(await upload());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining(key) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 500])("handles Meta HTTP %i without exposing private provider data", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "private-provider-details", type: "api_error" } }, { status }));
    const response = await POST(await upload());
    expect(response.status).toBe(status === 429 ? 429 : 502);
    const body = await response.text();
    expect(body).toContain("Meta");
    expect(body).not.toContain("private-provider-details");
    expect(body).not.toContain("test-meta-placeholder");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects truncated or malformed SAM output without classifying partial crops", async () => {
    for (const stream of [samStream(samText(1), ""), samStream(samText(1) + ",2<|broken|>"), samStream("unexpected output")]) {
      fetchMock.mockResolvedValueOnce(stream);
      expect((await POST(await upload())).status).toBe(502);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("handles network failure and malformed Decisions answers", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    expect((await POST(await upload())).status).toBe(502);
    fetchMock.mockResolvedValueOnce(samStream(samText(1)));
    fetchMock.mockResolvedValueOnce(Response.json({ unexpected: true }));
    expect(await (await POST(await upload())).json()).toMatchObject({ score: null, recognition: { status: "needs_correction" } });
  });
});
