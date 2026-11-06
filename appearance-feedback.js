/** 사진에 보이는 요소만 사용한 오락용 설명. 성격·건강·매력 점수를 추론하지 않습니다. */
export function getAppearanceFeedback(expression, factors, qualityLabel = "") {
  const label = expression?.label || "표정 판독 어려움";
  let impression = "차분하고 자연스러운 표정이 사진에 담겨 있어요.";
  let expressionTip = "얼굴을 편안하게 하고 입꼬리를 살짝 올려 여러 장 찍어 보세요. 표정에 따라 사진 속 분위기가 달라질 수 있어요.";

  if (label.includes("미소")) {
    impression = "미소가 돋보여 부드럽고 밝은 분위기의 사진이에요.";
    expressionTip = "지금처럼 자연스러운 미소를 유지하면서 눈높이에서 찍으면 표정이 더 잘 전달될 수 있어요.";
  } else if (label.includes("변화가 적은")) {
    impression = "표정 변화가 적어 단정하고 차분한 분위기로 보여요.";
    expressionTip = "조금 더 밝은 분위기를 원한다면 입꼬리를 살짝 올린 사진도 비교해 보세요.";
  } else if (label.includes("눈·입이 강조")) {
    impression = "눈과 입의 움직임이 뚜렷해 생동감 있는 사진이에요.";
    expressionTip = "좀 더 자연스러운 분위기를 원한다면 표정을 가볍게 풀고 촬영해 보세요.";
  } else if (label.includes("표정선이 강조")) {
    impression = "눈썹과 입 주변 선이 또렷하게 드러난 사진이에요.";
    expressionTip = "부드러운 분위기로 촬영하고 싶다면 이마와 눈썹의 힘을 살짝 빼 보세요.";
  } else if (label.includes("미소가 두드러지지")) {
    impression = "미소가 크게 드러나지 않아 잔잔한 분위기가 느껴지는 사진이에요.";
  } else if (label.includes("판독 어려움") || label.includes("뚜렷하지")) {
    impression = "표정을 정확하게 구분하기 어려워 첫인상을 단정하지 않았어요.";
    expressionTip = "정면에서 눈과 입이 잘 보이도록 다시 촬영하면 좀 더 구체적인 표현을 확인할 수 있어요.";
  }

  const light = factors?.light?.label || "";
  const skin = factors?.skin;
  const hair = factors?.hair;
  let tip = expressionTip;
  let tipCategory = "표정";
  if (light === "어두운 사진") {
    tipCategory = "조명";
    tip = "얼굴에 그늘이 생겼어요. 창가의 부드러운 자연광에서 다시 찍으면 얼굴선과 피부결이 더 균일하게 보일 수 있어요.";
  } else if (light === "밝은 사진") {
    tipCategory = "조명";
    tip = "빛이 조금 강해 보여요. 직사광선을 피하고 빛을 분산시키면 피부와 표정이 더 자연스럽게 담길 수 있어요.";
  } else if (qualityLabel.includes("재촬영")) {
    tipCategory = "사진 구도";
    tip = "얼굴을 화면 중앙에 조금 더 크게 담고 선명하게 촬영해 보세요. 분석 결과와 인상 표현이 더 안정적일 수 있어요.";
  } else if (skin?.textureLabel === "미세 무늬가 비교적 뚜렷함") {
    tipCategory = "피부 표현";
    tip = "사진에서 피부의 미세한 명암이 도드라져 보여요. 부드러운 조명과 과하지 않은 보정으로 표현을 비교해 보세요. 피부 상태를 진단한 것은 아니에요.";
  } else if (skin?.toneLabel === "빛·색감 차이가 비교적 큰 편") {
    tipCategory = "빛·색감";
    tip = "얼굴에 빛과 색감 차이가 비교적 크게 잡혔어요. 정면의 고른 조명에서 촬영하면 한결 균일한 사진을 얻을 수 있어요.";
  } else if (hair?.available === false && hair?.note?.includes("잘렸")) {
    tipCategory = "머리 연출";
    tip = "사진 위쪽 여백을 조금 더 남기면 헤어스타일 전체가 보이며 균형 잡힌 구도가 돼요.";
  }
  return {
    impression,
    tipCategory,
    tip,
    disclaimer: "한 장의 사진에서 보이는 표정과 촬영 조건을 바탕으로 한 참고 의견이에요. 성격·매력·피부 건강·실제 머리숱을 판단하지 않습니다."
  };
}