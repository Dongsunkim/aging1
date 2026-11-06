// 사용자 사진에만 적용하는 경량 파일 검증입니다.
// 이미지의 형식 서명과 헤더 크기를 먼저 읽어 디코더 과부하를 줄입니다.
// 브라우저/OS 디코더 취약점을 모두 예방하는 것은 아닙니다.
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 8192;
export const MAX_IMAGE_PIXELS = 24 * 1024 * 1024;
export const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const read16BE = (a, i) => (a[i] << 8) | a[i + 1];
const read16LE = (a, i) => a[i] | (a[i + 1] << 8);
const read32BE = (a, i) => a[i] * 0x1000000 + (a[i + 1] << 16) + (a[i + 2] << 8) + a[i + 3];
const ascii = (a, i, size) => String.fromCharCode(...a.slice(i, i + size));

export function isAllowedDimensions(width, height) {
  return Number.isInteger(width) && Number.isInteger(height)
    && width >= 64 && height >= 64
    && width <= MAX_IMAGE_EDGE && height <= MAX_IMAGE_EDGE
    && width * height <= MAX_IMAGE_PIXELS;
}

export function inspectImageHeader(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return null;

  // PNG: 8바이트 고정 서명과 IHDR의 가로/세로 크기를 확인
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.every((value, i) => bytes[i] === value)) {
    if (ascii(bytes, 12, 4) !== "IHDR" || read32BE(bytes, 8) !== 13) return null;
    return { type: "image/png", width: read32BE(bytes, 16), height: read32BE(bytes, 20) };
  }

  // JPEG: 첫 1MB 안에서 SOF 마커와 실제 픽셀 크기를 파악
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      while (i < bytes.length && bytes[i] === 0xff) i++;
      if (i >= bytes.length) break;
      const marker = bytes[i++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (i + 2 > bytes.length) break;
      const length = read16BE(bytes, i);
      if (length < 2 || i + length > bytes.length) return null;
      if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (length < 7) return null;
        return { type: "image/jpeg", width: read16BE(bytes, i + 5), height: read16BE(bytes, i + 3) };
      }
      i += length;
    }
    return null;
  }

  // WebP: RIFF / WebP 헤더와 VP8(X/L) 이미지 크기를 검사
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      // 애니메이션/프레임 전환은 사진 분석에서 제외
      if (bytes[20] & 0x02) return null;
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { type: "image/webp", width, height };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
      return { type: "image/webp", width: read16LE(bytes, 26) & 0x3fff, height: read16LE(bytes, 28) & 0x3fff };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const a = bytes[21], b = bytes[22], c = bytes[23], d = bytes[24];
      return { type: "image/webp", width: 1 + a + ((b & 0x3f) << 8),
        height: 1 + ((b >> 6) | (c << 2) | ((d & 0x0f) << 10)) };
    }
  }
  return null;
}

export async function validatePhotoFile(file) {
  if (!file || !SUPPORTED_TYPES.has(file.type)) {
    throw new Error("JPG, PNG, WEBP 사진만 선택할 수 있습니다.");
  }
  if (!Number.isSafeInteger(file.size) || file.size < 24 || file.size > MAX_FILE_BYTES) {
    throw new Error("파일 크기는 12MB 이하여야 합니다. 다른 사진을 선택해 주세요.");
  }
  // 사진을 네트워크로 전송하지 않고 헤더 일부만 로컬 메모리에서 읽습니다.
  const header = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
  const info = inspectImageHeader(header);
  if (!info || info.type !== file.type) {
    throw new Error("이미지 형식이 올바르지 않거나 손상된 파일입니다. 다른 사진을 선택해 주세요.");
  }
  if (!isAllowedDimensions(info.width, info.height)) {
    throw new Error("이미지 크기가 너무 크거나 작습니다. 64픽셀 이상, 최대 8192픽셀·2400만 화소의 사진을 사용해 주세요.");
  }
  return info;
}

export function safeDisplayName(name) {
  return String(name || "사진").replace(/[\x00-\x1f\x7f-\x9f]/g, "").slice(0, 80) || "사진";
}
