/**
 * 토스 SDK 사진첩 응답을 기존 사진 검증/분석용 File로 변환합니다.
 * 사진 원본은 업로드하거나 저장하지 않고 현재 WebView 메모리에서만 사용합니다.
 */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 12;
export function convertTossAlbumPhotoToFile(photo) {
  let raw = photo?.dataUri;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("선택한 사진의 데이터가 없습니다. 다른 사진을 선택해 주세요.");
  }
  let mime = "image/jpeg";
  // 공식 SDK base64:true는 dataUri에 접두사를 붙이지 않고 JPEG 데이터를 반환합니다.
  if (raw.startsWith("data:")) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    if (!match) throw new Error("지원하지 않는 사진 데이터 형식입니다.");
    mime = match[1];
    raw = match[2];
  }
  if (raw.length > MAX_BASE64_LENGTH || raw.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new Error("사진 데이터의 크기 또는 형식이 올바르지 않습니다.");
  }
  let binary;
  try {
    binary = atob(raw);
  } catch {
    throw new Error("사진 데이터를 읽지 못했습니다. 다른 사진으로 시도해 주세요.");
  }
  if (binary.length === 0 || binary.length > MAX_IMAGE_BYTES) {
    throw new Error("사진은 12MB 이하만 사용할 수 있습니다.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return new File([bytes], `toss-selected-photo.${ext}`, { type: mime });
}

export function explainTossAlbumError(error) {
  const details = String(error instanceof Error ? error.message : error || "");
  const msg = details.toLowerCase();
  if (/cancel|취소/.test(msg)) return "사진 선택이 취소됐습니다. 다시 눌러 사진을 선택해 주세요.";
  if (/no_permission|permission.*required|not.*permission|권한.*없|permission.*denied|ospermissiondenied|denied|거부/.test(msg))
    return "토스 앱의 사진첩 접근 권한이 없습니다. 휴대전화 설정 > 앱 > 토스 > 사진 및 동영상에서 허용하고 다시 시도해 주세요. 최신 앱인토스 번들도 확인해 주세요.";
  if (/unsupported|not supported|unavailable|bridge|sdk/.test(msg))
    return "토스 사진첩을 실행하지 못했습니다. 샘플 테스트 환경과 토스 앱 버전을 확인해 주세요.";
  if (/timeout|timed out|지연/.test(msg))
    return "토스 사진첩 응답이 지연되고 있습니다. 사진첩을 닫고 다시 시도해 주세요.";
  return "사진첩을 열지 못했습니다. 토스 앱의 사진 접근 권한과 최신 번들을 확인하고 다시 시도해 주세요.";
}
