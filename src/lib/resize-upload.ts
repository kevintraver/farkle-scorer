import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE } from "./upload";

/** Use the browser's image decoder (including Safari HEIC support) before JPEG conversion/resizing. */
export async function resizeImageForUpload(file: File) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const converted = !ACCEPTED_IMAGE_TYPES.includes(file.type);
    const resized = scale < 1 || file.size > MAX_IMAGE_BYTES;
    if (!resized && !converted) {
      return { file, width: image.naturalWidth, height: image.naturalHeight, resized, converted };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image resizing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("The resized photo could not be encoded.")), "image/jpeg", 0.9);
    });
    return {
      file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified }),
      width: canvas.width, height: canvas.height, resized, converted,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
