// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analysisFor } from "@/test/fixtures";
import Playground from "./page";

function choosePhoto(name = "roll.png", type = "image/png") {
  fireEvent.change(screen.getByLabelText("Upload a dice photo"), {
    target: { files: [new File(["image"], name, { type })] },
  });
}

describe("photo playground", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const revokeUrl = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("Image", class {
      naturalWidth = 800;
      naturalHeight = 600;
      src = "";
      decode = vi.fn(async () => {});
    });
    class TestURL extends URL {
      static createObjectURL = vi.fn(() => "blob:test-photo");
      static revokeObjectURL = revokeUrl;
    }
    vi.stubGlobal("URL", TestURL);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("uploads a photo, shows its score, and recalculates edits without API calls", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(analysisFor()));
    render(<Playground />);
    expect(screen.getByRole("button", { name: "Analyze roll" }).hasAttribute("disabled")).toBe(true);
    choosePhoto();
    expect(screen.getByAltText("Your uploaded dice roll")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Analyze roll" }));
    expect(await screen.findByLabelText("Roll score: 350 points")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Die 6 value"), { target: { value: "1" } });
    expect(screen.getByLabelText("Roll score: 450 points")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "API details" }));
    expect(screen.getAllByText("900", { selector: "span" })).toHaveLength(2);
    expect(screen.getByText("gpt-6-luna")).toBeTruthy();
    expect(screen.getByText("sam-3.1")).toBeTruthy();
    expect(screen.getAllByAltText(/Segmented crop for die/)).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Images sent to Decisions" }));
    expect(screen.getAllByAltText(/Isolated image sent for die/)).toHaveLength(6);
    expect(screen.getAllByAltText(/Context image sent for die/)).toHaveLength(6);
    expect(screen.getByAltText("Context image sent for die 1").getAttribute("src")).toBe("data:image/png;base64,context0");
    fireEvent.click(screen.getByRole("button", { name: "Response JSON" }));
    expect(screen.getByText(/"segmentation":/, { selector: "pre" }).textContent).not.toContain("data:image/png");
  });

  it("requires completing manual dice entry before scoring an unreadable photo", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(analysisFor([])));
    render(<Playground />);
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Analyze roll" }));
    await screen.findByText("Enter the dice to finish this roll");
    expect(screen.queryByLabelText(/Roll score:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Add die" }));
    expect(screen.queryByLabelText(/Roll score:/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Die 1 value"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Score entered dice" }));
    expect(screen.getByLabelText("Roll score: 50 points")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove die 1" }));
    expect(screen.queryByLabelText(/Roll score:/)).toBeNull();
    expect(screen.queryByText("Farkle", { exact: true })).toBeNull();
  });

  it("accepts a camera photo and keeps the current roll when the picker is canceled", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(analysisFor()));
    render(<Playground />);
    const camera = screen.getByLabelText("Take a dice photo");
    expect(camera.getAttribute("accept")).toBe("image/*");
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(screen.getByLabelText("Upload a dice photo").hasAttribute("capture")).toBe(false);
    fireEvent.change(camera, { target: { files: [new File(["photo"], "camera.jpg", { type: "image/jpeg" })] } });
    expect(screen.getByText("camera.jpg")).toBeTruthy();
    expect(screen.getByLabelText("Take a dice photo")).toBe(camera);
    fireEvent.click(screen.getByRole("button", { name: "Analyze roll" }));
    await screen.findByLabelText("Roll score: 350 points");
    fireEvent.change(screen.getByLabelText("Take a dice photo"), { target: { files: [] } });
    expect(screen.getByLabelText("Roll score: 350 points")).toBeTruthy();
    expect(screen.getByText("camera.jpg")).toBeTruthy();
  });

  it("accepts HEIC photos from the iOS library for browser conversion", () => {
    render(<Playground />);
    choosePhoto("IMG_1234.HEIC", "image/heic");
    expect(screen.getByText("IMG_1234.HEIC")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Analyze roll" }).hasAttribute("disabled")).toBe(false);
  });

  it("keeps unreadable crops visible and waits for their correction", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(analysisFor([5, "unclear"])));
    render(<Playground />);
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Analyze roll" }));
    await screen.findByAltText("Segmented crop for die 2");
    expect(screen.queryByLabelText(/Roll score:/)).toBeNull();
    expect(screen.getByRole("button", { name: "Score entered dice" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Die 2 value"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Score entered dice" }));
    expect(screen.getByLabelText("Roll score: 150 points")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears old results when the photo is replaced and revokes its preview URL", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(analysisFor()));
    render(<Playground />);
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Analyze roll" }));
    await screen.findByLabelText("Roll score: 350 points");
    choosePhoto("next.png");
    expect(screen.queryByLabelText(/Roll score:/)).toBeNull();
    expect(screen.queryByRole("button", { name: "API details" })).toBeNull();
    expect(revokeUrl).toHaveBeenCalledWith("blob:test-photo");
  });

  it("ignores an old API result if the photo changes while loading", async () => {
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    render(<Playground />);
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Analyze roll" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Reading your dice…" }).hasAttribute("disabled")).toBe(true);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    choosePhoto("replacement.png");
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(Response.json(analysisFor())); });
    expect(screen.queryByLabelText(/Roll score:/)).toBeNull();
    expect(screen.getByText("replacement.png")).toBeTruthy();
  });

  it("shows upload and API errors next to the action", async () => {
    render(<Playground />);
    choosePhoto("bad.txt", "text/plain");
    expect(screen.getByRole("alert").textContent).toContain("JPEG, PNG, WebP, or HEIC");
    expect(fetchMock).not.toHaveBeenCalled();
    choosePhoto();
    fetchMock.mockResolvedValueOnce(Response.json({ ok: false, error: "Check your API quota." }, { status: 429 }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze roll" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Check your API quota."));
    expect(screen.queryByLabelText(/Roll score:/)).toBeNull();
    expect(screen.getByRole("button", { name: "Analyze roll" }).hasAttribute("disabled")).toBe(false);
  });
});
