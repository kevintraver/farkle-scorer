import { MAX_IMAGE_BYTES, MAX_IMAGE_EDGE } from "./upload";

/** Decode with EXIF orientation, and resize only photos that exceed upload limits. */
export async function resizeImageForUpload(file: File) {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
    if (scale === 1 && file.size <= MAX_IMAGE_BYTES) {
      return { file, width: image.width, height: image.height, resized: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
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
      width: canvas.width, height: canvas.height, resized: true,
    };
  } finally {
    image.close();
  }
}
