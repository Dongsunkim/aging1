// 나이 모델의 결과를 객관적 진실처럼 단정하지 않기 위한 최소 검증 규칙.
// 사진 원본이나 얼굴 특징 벡터는 저장하지 않으며, 같은 탭에서만 작은 사진 지문과 숫자를 보관합니다.

export function fingerprintCanvas(canvas) {
  const small = document.createElement("canvas");
  small.width = 16;
  small.height = 16;
  const context = small.getContext("2d", {willReadFrequently: true});
  if (!context) throw new Error("사진 변경 여부를 확인할 수 없습니다.");
  context.drawImage(canvas, 0, 0, small.width, small.height);
  const data = context.getImageData(0, 0, 16, 16).data;
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 4) {
    // 색상 각 채널을 0..15로 양자화해 너무 작은 이미지 잡음에 덜 민감하게 합니다.
    for (let k = 0; k < 3; k++) {
      hash ^= data[i + k] >> 4;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

export function assessRepeatedAge(history, fingerprint, age) {
  if (!Number.isFinite(age) || age < 1 || age > 100 || typeof fingerprint !== "string" || !fingerprint) {
    return {valid: false, repeated: false, history};
  }
  // 같은 사진을 재분석한 것은 독립적인 새 입력으로 세지 않습니다.
  const deduplicated = history.filter(item => item.fingerprint !== fingerprint);
  const updated = [...deduplicated, {fingerprint, age}].slice(-8);
  // 정수만 같은 것은 우연일 수 있으므로 원시 모델값이 0.35세 이내로
  // 세 장 이상의 서로 다른 사진에서 거의 동일할 때만 반복 출력으로 표시합니다.
  const repeated = updated.filter(item => Math.abs(item.age - age) <= 0.35).length >= 3;
  return {valid: true, repeated, history: updated};
}

export function compareAgeModels(primaryAge, secondaryAge) {
  if (!Number.isFinite(secondaryAge) || secondaryAge < 1 || secondaryAge > 100) {
    return {available:false, disagreement:false, gap:null};
  }
  const gap = Math.abs(primaryAge - secondaryAge);
  // 검증된 정확도 기준은 아니며, 두 모델 값이 크게 엇갈렸음을 알려주는 표시용 임계값입니다.
  return {available:true, disagreement:gap >= 12, gap};
}
