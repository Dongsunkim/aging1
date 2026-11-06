/**
 * Pure, on-device visual descriptors. NOT clinically validated skin / hair metrics.
 * Image classification mask ids from MediaPipe SelfieMulticlass:
 * 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 accessories.
 */

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function getFaceRect(face) {
  const box = face?.boxRaw;
  if (!Array.isArray(box) || box.length < 4 || !box.every(Number.isFinite)) return null;
  const [x, y, w, h] = box;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function pixelCategory(mask, nx, ny) {
  if (!mask || !mask.pixels || !mask.width || !mask.height) return -1;
  const x = clamp(Math.floor(nx * mask.width), 0, mask.width - 1);
  const y = clamp(Math.floor(ny * mask.height), 0, mask.height - 1);
  return mask.pixels[y * mask.width + x];
}

function rgbLuminance(data, i) {
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

/** Measures visibility of segmented hair, NOT the number/density of follicles. */
export function measureHairVisibility(mask, face) {
  const rect = getFaceRect(face);
  if (!mask || !rect) return { available: false, text: "측정 불가", note: "영역 분할 정보를 확인하지 못했습니다." };

  // Upper-head ROI deliberately includes space above the detected face.
  const x0 = rect.x - rect.w * 0.22;
  const x1 = rect.x + rect.w * 1.22;
  const y0 = rect.y - rect.h * 0.47;
  const y1 = rect.y + rect.h * 0.24;

  // A cropped head/very small ROI cannot support even a photographic visibility estimate.
  const roiWidth = x1 - x0;
  const roiHeight = y1 - y0;
  const lostTop = Math.max(0, -y0) / roiHeight;
  const lostSides = (Math.max(0, -x0) + Math.max(0, x1 - 1)) / roiWidth;
  if (lostTop > 0.3 || lostSides > 0.3 || roiHeight < 0.08) {
    return { available: false, text: "확인 어려움", note: "머리 위쪽이 크게 잘렸거나 얼굴이 프레임 가장자리에 있습니다." };
  }
  const minX = clamp(Math.floor(x0 * mask.width), 0, mask.width - 1);
  const maxX = clamp(Math.ceil(x1 * mask.width), 0, mask.width);
  const minY = clamp(Math.floor(y0 * mask.height), 0, mask.height - 1);
  const maxY = clamp(Math.ceil(y1 * mask.height), 0, mask.height);
  let hair = 0;
  let count = 0;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      count++;
      hair += Number(mask.pixels[y * mask.width + x] === 1);
    }
  }
  if (!count) return { available: false, text: "확인 어려움", note: "머리카락 영역이 충분히 보이지 않습니다." };
  const percent = Math.round((100 * hair) / count);
  return {
    available: true,
    percent,
    text: `상단 영역 중 약 ${percent}% 감지`,
    note: "사진에 보이는 머리카락 픽셀 비율입니다. 실제 머리숱·모발 밀도·탈모 정도를 뜻하지 않습니다.",
  };
}

/**
 * Computes simple skin-region image descriptors. Thresholds are descriptive,
 * not age-correction weights or measurements of skin health.
 */
export function measureSkinAppearance(imageData, mask, face) {
  const rect = getFaceRect(face);
  if (!mask || !rect || !imageData?.data) return null;
  const { width, height, data } = imageData;
  if (!width || !height || data.length !== width * height * 4) return null;
  const x0 = clamp(Math.round((rect.x + rect.w * 0.18) * width), 2, width - 3);
  const x1 = clamp(Math.round((rect.x + rect.w * 0.82) * width), 2, width - 2);
  const y0 = clamp(Math.round((rect.y + rect.h * 0.10) * height), 2, height - 3);
  const y1 = clamp(Math.round((rect.y + rect.h * 0.76) * height), 2, height - 2);
  if (x1 <= x0 || y1 <= y0) return null;

  let sum = 0, sumSq = 0, localContrast = 0, count = 0, contrastCount = 0;
  const step = Math.max(2, Math.round(width / 390));
  const n = 2;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const nx = x / width, ny = y / height;
      if (pixelCategory(mask, nx, ny) !== 3) continue;
      const i = (y * width + x) * 4;
      const value = rgbLuminance(data, i);
      sum += value;
      sumSq += value * value;
      count++;
      if (x - n < 0 || x + n >= width || y - n < 0 || y + n >= height) continue;
      const neighbors = [
        [x - n, y], [x + n, y], [x, y - n], [x, y + n],
      ];
      if (neighbors.some(([px, py]) => pixelCategory(mask, px / width, py / height) !== 3)) continue;
      const avg = neighbors.reduce((acc, [px, py]) => acc + rgbLuminance(data, (py * width + px) * 4), 0) / 4;
      localContrast += Math.abs(value - avg);
      contrastCount++;
    }
  }
  if (count < 120 || contrastCount < 70) return null;
  const mean = sum / count;
  const sd = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  const variation = sd / Math.max(mean, 65);
  const texture = (localContrast / contrastCount) / Math.max(mean, 80);
  let toneLabel = "빛·색감 차이가 보통";
  if (variation < 0.11) toneLabel = "빛·색감 차이가 적은 편";
  if (variation > 0.24) toneLabel = "빛·색감 차이가 비교적 큰 편";
  let textureLabel = "미세 무늬가 보통 수준";
  if (texture < 0.011) textureLabel = "미세 무늬가 적게 관찰됨";
  if (texture > 0.04) textureLabel = "미세 무늬가 비교적 뚜렷함";
  return {
    toneLabel,
    textureLabel,
    meanBrightness: Math.round(mean),
    variation: Number(variation.toFixed(3)),
    texture: Number(texture.toFixed(3)),
    note: "피부로 분류된 영역의 밝기 편차·국소 명암 변화를 측정했습니다. 피부 건강, 주름 개수, 실제 피부 나이 또는 피부과 진단이 아닙니다.",
  };
}

/** Overall image brightness; a quality warning, not a model confidence. */
export function measurePhotoLight(imageData, face) {
  const rect = getFaceRect(face);
  if (!rect || !imageData?.data) return { label: "판정 어려움", note: "얼굴 영역을 찾지 못했습니다." };
  const { width, height, data } = imageData;
  const x0 = clamp(Math.round(rect.x * width), 0, width - 1);
  const x1 = clamp(Math.round((rect.x + rect.w) * width), 0, width);
  const y0 = clamp(Math.round(rect.y * height), 0, height - 1);
  const y1 = clamp(Math.round((rect.y + rect.h) * height), 0, height);
  let total = 0, bright = 0, dark = 0, count = 0;
  const step = Math.max(2, Math.round(width / 350));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const v = rgbLuminance(data, (y * width + x) * 4);
      total += v;
      bright += Number(v > 242);
      dark += Number(v < 32);
      count++;
    }
  }
  if (!count) return { label: "판정 어려움", note: "얼굴 영역이 작습니다." };
  const mean = total / count;
  if (mean < 65 || dark / count > 0.48) return { label: "어두운 사진", note: "그림자가 짙으면 피부 무늬와 나이 추정값이 달라질 수 있습니다." };
  if (mean > 212 || bright / count > 0.35) return { label: "밝은 사진", note: "강한 조명·과다 노출로 미세한 선이 가려질 수 있습니다." };
  return { label: "밝기 범위 양호", note: "촬영 각도·보정·화질에 따라 분석값은 달라질 수 있습니다." };
}

export function analyzeVisibleFactors(imageData, face, mask) {
  return {
    light: measurePhotoLight(imageData, face),
    skin: measureSkinAppearance(imageData, mask, face),
    hair: measureHairVisibility(mask, face),
  };
}