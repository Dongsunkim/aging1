/** Presentation-only verdicts. Not a calibrated or diagnostic model. */
const GENDERS = Object.freeze({
  male: "남성", female: "여성", other: "기타", undisclosed: "응답 안 함",
});

export function getGenderLabel(value) { return GENDERS[value] || "선택 안 함"; }

export function validateActualAge(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (value === "") return { valid: true, age: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 110) {
    return { valid: false, age: null, message: "실제 나이는 1세부터 110세까지의 정수로 입력해 주세요. 입력을 생략해도 됩니다." };
  }
  return { valid: true, age: n };
}

export function getExpressionHint(emotions) {
  if (!Array.isArray(emotions) || !emotions.length) {
    return { label: "표정 판독 어려움", note: "표정 분석 모델 결과를 확인하지 못했습니다." };
  }
  const choices = emotions.filter(({score, emotion}) => Number.isFinite(score) && typeof emotion === "string");
  if (!choices.length) return { label: "표정 판독 어려움", note: "사진에서 표정이 충분히 드러나지 않았습니다." };
  const top = choices.reduce((best, current) => current.score > best.score ? current : best);
  if (top.score < 0.45) return { label: "표정이 뚜렷하지 않음", note: "표정 신호가 불분명해 단정하지 않습니다." };
  const labels = {
    happy: "미소가 보이는 표정",
    neutral: "표정 변화가 적은 모습",
    surprise: "눈·입이 강조된 표정",
    angry: "표정선이 강조된 모습",
    disgust: "표정선이 강조된 모습",
    fear: "표정 변화가 감지된 모습",
    sad: "미소가 두드러지지 않는 모습",
  };
  return { label: labels[top.emotion] || "표정 변화가 감지됨", note: "사진상의 표정 모양 추정이며 실제 감정을 판단하지 않습니다." };
}

export function getFunVerdict(estimatedAge, actualAge = null) {
  if (!Number.isFinite(estimatedAge)) throw new Error("나이 추정값이 필요합니다.");
  const estimate = Math.round(estimatedAge);
  if (actualAge == null) {
    return {
      title: "오늘 AI의 촉은 어떨까요? 😎",
      message: `제 예상은 ${estimate}세예요! 실제 나이를 알려주시면 동안인지도 재미로 비교해 드릴게요~`,
      comparison: "실제 나이 미입력",
    };
  }
  const gap = actualAge - estimate;
  if (gap >= 4) {
    return {
      title: "동안이시네요~ ✨",
      message: `실제 ${actualAge}세인데 AI 눈에는 ${estimate}세! 무려 ${gap}살 어려 보인다는 결과예요. 오늘 사진 완전 성공!`,
      comparison: `실제보다 ${gap}세 어려 보임`,
    };
  }
  if (gap <= -4) {
    const older = Math.abs(gap);
    return {
      title: "앗, 오늘은 조금 성숙해 보여요~ 😅",
      message: `실제 ${actualAge}세보다 ${older}살 더 높게 나왔어요. 아쉽지만 조명이나 표정 때문일 수도 있으니 다른 사진으로 재도전!`,
      comparison: `실제보다 ${older}세 높게 추정`,
    };
  }
  return {
    title: "와, 또래 느낌이 딱이에요! 🎯",
    message: `실제 ${actualAge}세와 AI 추정 ${estimate}세가 비슷하게 나왔어요. 거의 맞혔는데요?`,
    comparison: gap === 0 ? "실제 나이와 일치" : `실제 나이와 ${Math.abs(gap)}세 차이`,
  };
}