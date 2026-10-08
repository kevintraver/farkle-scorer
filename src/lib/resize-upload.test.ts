// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resizeImageForUpload } from "./resize-upload";
import { validateImage, validatePhotoSelection } from "./upload";

describe("preparing camera and library photos", () => {
  const decode = vi.fn(async () => {});
  const revoke = vi.fn();
  const drawImage = vi.fn();
  let width = 800;
  let height = 600;

  beforeEach(() => {
    width = 800;
    height = 600;
    decode.mockReset();
    revoke.mockReset();
    drawImage.mockReset();
    vi.stubGlobal("Image", class {
      naturalWidth = width;
      naturalHeight = height;
      src = "";
      decode = decode;
    });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: revoke });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => callback(new Blob(["jpeg"], { type })));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("preserves an already-small JPEG and releases its temporary preview", async () => {
    const file = new File(["photo"], "camera.jpg", { type: "image/jpeg" });
    expect(await resizeImageForUpload(file)).toEqual({ file, width: 800, height: 600, resized: false, converted: false });
    expect(drawImage).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:photo");
  });

  it.each(["image/heic", "image/heif", ""])("converts a small HEIC photo (%s) before strict server validation", async (type) => {
    const file = new File(["photo"], "IMG_1234.HEIC", { type });
    expect(validatePhotoSelection(file)).toBeNull();
    expect(validateImage(file)).not.toBeNull();
    const result = await resizeImageForUpload(file);
    expect(result).toMatchObject({ width: 800, height: 600, resized: false, converted: true });
    expect(result.file.name).toBe("IMG_1234.jpg");
    expect(result.file.type).toBe("image/jpeg");
    expect(validateImage(result.file)).toBeNull();
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
  });

  it("resizes a portrait camera photo without changing its proportions", async () => {
    width = 3024;
    height = 4032;
    const result = await resizeImageForUpload(new File(["photo"], "camera.jpg", { type: "image/jpeg" }));
    expect(result).toMatchObject({ width: 1536, height: 2048, resized: true, converted: false });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1536, 2048);
  });

  it("releases the temporary URL if the browser cannot decode a photo", async () => {
    decode.mockRejectedValueOnce(new Error("Unsupported photo"));
    await expect(resizeImageForUpload(new File(["photo"], "photo.heic", { type: "image/heic" }))).rejects.toThrow("Unsupported photo");
    expect(revoke).toHaveBeenCalledWith("blob:photo");
  });
});
