/** Telefon fotoğrafları 3-5 MB gelir; ahır bağlantısıyla yüklenmesi imkânsız. Yüklemeden önce küçültülür. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface PreparedFile {
  mime: string;
  /** Base64, veri şeması öneki olmadan. */
  data: string;
  size: number;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Büyük dosyada tek seferde spread yığını taşırır; parça parça çevir.
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** PDF ve diğer belgeler olduğu gibi; görseller uzun kenarı 1600 px olacak şekilde jpeg'e çevrilir. */
export async function prepareFile(file: File): Promise<PreparedFile> {
  if (!file.type.startsWith("image/")) {
    return { mime: file.type, data: toBase64(await file.arrayBuffer()), size: file.size };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel işlenemedi");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Görsel küçültülemedi");
  return { mime: "image/jpeg", data: toBase64(await blob.arrayBuffer()), size: blob.size };
}

/** Base64 → Blob; yerel önizleme ve yükleme için. */
export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
