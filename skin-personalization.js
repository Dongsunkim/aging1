/**
 * 촬영된 사진의 시각적 단서에 따라 피부 관리 상식을 우선순위화합니다.
 * 얼굴의 유분량/건조도/모공/여드름/색소질환/실제 주름을 진단하지 않습니다.
 * 로컬 분석 결과에 한하며 사진을 업로드하거나 개인 기록을 저장하지 않습니다.
 */
const SOURCES = Object.freeze({
  moisturizing:"https://www.aad.org/public/everyday-care/skin-care-basics/dry/pick-moisturizer",
  skinBarrier:"https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin",
  sunscreen:"https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/practice-safe-sun",
  tinted:"https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/understand-sunscreen-labels",
  patch:"https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products",
});
function tip(id, icon, tag, title, body, because, sourceUrl) {
  return {id,icon,tag,title,body,because,sourceUrl};
}
const isNumber=(v)=>typeof v==="number" && Number.isFinite(v);

/**
 * 4개 카드로 현재 사진의 특징, 사진 품질, 관리 상식이 연결되게 만듭니다.
 * 결괏값은 성별/실제나이/외모나이 및 사진의 인종·국적에 따라 바뀌지 않습니다.
 */
export function personalizeSkinKnowledge(factors) {
  const skin=factors?.skin ?? null;
  const light=factors?.light?.label || "";
  const quality=factors?.photoQuality ?? null;
  const skinPhotoIssue=quality?.skinUsable === false;
  const unevenCheekLighting=skin?.toneReliable === false;
  const isDark=light==="어두운 사진";
  const isBright=light==="밝은 사진";
  const qualityConcern=isDark||isBright||light==="판정 어려움"||skinPhotoIssue||unevenCheekLighting;
  const hasSkin=!!skin && isNumber(skin.variation) && isNumber(skin.texture);
  const variation=hasSkin?skin.variation:null;
  const texture=hasSkin?skin.texture:null;
  const glint=hasSkin && isNumber(skin.brightPatchRatio)?skin.brightPatchRatio:null;
  const visualSource=skin?.source==="face-patch"?"볼 영역 표본":"피부 분할 영역";
  const observations=[];
  if(qualityConcern){
    observations.push(skinPhotoIssue ? "사진 품질로 피부결 비교 제한"
      : unevenCheekLighting ? "좌우 볼 영역 밝기 차이가 큰 사진"
      : isDark ? "얼굴 그림자가 비교적 진한 사진"
      : isBright ? "밝은 빛이 강한 사진" : "사진 밝기 확인 어려움");
  }else observations.push("사진 밝기 범위 양호");
  if(hasSkin){
    observations.push(skin.toneLabel || "피부 영역 색감 비교");
    observations.push(skin.textureLabel || "피부 영역 명암 비교");
    if(glint!==null && glint>0.075)observations.push("밝게 반사된 픽셀 관찰");
  }else observations.push("피부 영역 세부 비교 제한");

  const items=[];
  if(qualityConcern){
    items.push(tip("lighting","☀","사진 품질","촬영 조건을 먼저 확인해 주세요",
      skinPhotoIssue
        ? `${quality.skinLimitReason} 얼굴을 화면에 조금 크게 담고, 흔들림 없이 밝은 창가에서 촬영해 보세요. 피부 상태가 나쁘다는 의미는 아니에요.`
        : unevenCheekLighting
        ? "좌우 볼의 밝기 차이가 커요. 색감 차이가 피부 자체 때문인지 조명 때문인지 구분하기 어려우므로, 양쪽에 빛이 고르게 닿는 정면 사진으로 다시 비교해 보세요."
        : isDark
        ? "얼굴에 그림자가 진해 피부 표면의 색감·미세 무늬가 실제보다 두드러질 수 있어요. 창가의 부드러운 빛에서 같은 각도로 다시 촬영해 비교해 보세요."
        : "강한 빛 때문에 표면의 잔선이나 명암이 가려질 수 있어요. 직사광선을 피하고 같은 위치에서 부드러운 빛으로 촬영해 보세요.",
      "연결 단서: "+(skinPhotoIssue?"초점·잘림·노출 검사":unevenCheekLighting?"양쪽 볼 영역의 조명 차이":light||"촬영 밝기"),
      SOURCES.sunscreen));
  }
  if(!hasSkin){
    items.push(tip("skin-unavailable","◈","분석 제한","사진만으로 피부결을 구분하기 어려워요",
      "피부 분할 결과나 얼굴 표본이 부족해 피부결을 개인별로 구분하지 않았어요. 선명하고 그림자가 적은 정면 사진을 권장하며, 아래 기본 관리 상식을 참고해 주세요.",
      "연결 단서: 피부 표면 측정값 부족",SOURCES.moisturizing));
  }else{
    if(texture>0.04){
      items.push(tip("texture","✧","사진에서 관찰","미세 무늬가 두드러져 보일 때",
        "사진의 국소 명암이 비교적 뚜렷해요. 건조함이나 주름이라고 단정할 수는 없지만, 세안 후 당김이 실제로 느껴진다면 글리세린·세라마이드 성분의 순한 보습제를 고려해 보세요. 강한 스크럽으로 억지로 문지르지 않는 것이 좋아요.",
        "연결 단서: 얼굴 영역 국소 명암 변화가 비교적 큼",SOURCES.skinBarrier));
    } else if(texture<0.011){
      items.push(tip("fine-texture","✧","사진에서 관찰","매끈해 보이는 피부 표현 유지",
        "사진에서는 미세 명암 무늬가 적게 잡혀요. 촬영 보정이나 조명의 영향일 수도 있으니 건강한 피부라고 단정하지는 마세요. 자극이 적은 세안과 보습 중심의 루틴을 유지해 보세요.",
        "연결 단서: 얼굴 영역 미세 무늬가 적게 관찰됨",SOURCES.moisturizing));
    } else {
      items.push(tip("texture-basic","✧","사진에서 관찰","피부결 관리, 기본부터",
        "사진 속 미세 명암이 보통 범위로 측정됐어요. 결이 거칠거나 당기는 느낌이 실제로 있다면 향료가 없는 순한 세정제와 보습제를 먼저 사용해 보세요.",
        "연결 단서: 얼굴 영역 미세 무늬가 보통 수준",SOURCES.moisturizing));
    }
    if(unevenCheekLighting){
      items.push(tip("tone-lighting","◈","사진에서 관찰","색감 편차보다 조명 차이를 먼저 확인",
        "좌우 볼이 받는 빛이 달라 피부 고유의 색감 차이를 추정하지 않았어요. 얼굴 양쪽에 비슷한 조명이 비치는 사진에서 다시 비교해 보세요.",
        "연결 단서: 양쪽 볼의 평균 밝기 차이",SOURCES.sunscreen));
    } else if(variation>0.24){
      items.push(tip("tone-variation","◈","사진에서 관찰","빛·색감 차이가 크게 보인다면",
        "얼굴 피부 영역에서 명암 편차가 비교적 커 보여요. 그림자·화장·카메라 보정 때문일 수도 있어 잡티나 색소침착으로 판단하지 않아요. 평소 색소 관리가 고민이라면 광범위 SPF 30 이상 차단제를 사용하고, 필요하면 산화철 함유 색조 차단제를 고려해 보세요.",
        "연결 단서: 피부 영역 밝기 편차가 비교적 큼",SOURCES.tinted));
    }else if(variation<0.11){
      items.push(tip("tone-even","◈","사진에서 관찰","균일하게 보이는 색감 유지하기",
        "사진의 피부 영역에서 명암 차이가 적게 측정됐어요. 조명이나 필터의 영향도 있을 수 있습니다. 매일 광범위 SPF 30 이상 차단제를 사용하고, 실제 피부의 건조함·자극 여부에 따라 보습을 조절해 보세요.",
        "연결 단서: 피부 영역 밝기 편차가 적음",SOURCES.sunscreen));
    }else{
      items.push(tip("tone-basic","◈","사진에서 관찰","피부 색감은 촬영 빛에도 달라져요",
        "피부 영역 밝기 편차가 보통 수준으로 측정됐어요. 색소 질환을 뜻하지는 않습니다. 야외 활동 시 광범위 SPF 30 이상 차단제와 그늘·모자 사용이 기본이에요.",
        "연결 단서: 피부 영역 밝기 편차가 보통 수준",SOURCES.sunscreen));
    }
    if(glint!==null && glint>0.075&&!isBright){
      items.push(tip("highlights","◇","사진에서 관찰","반짝이는 부분과 실제 유분은 달라요",
        "일부 얼굴 픽셀이 밝게 반사돼 보이지만 사진으로 피지량을 측정할 수는 없어요. 실제 사용감이 번들거리면 가벼운 젤 보습제나 모공을 막지 않는 제품을 선택해 보세요.",
        "연결 단서: 얼굴 영역 밝은 반사 픽셀",SOURCES.moisturizing));
    }
  }
  // 예방 차원의 보편적인 관리 상식도 제공하며 얼굴 사진으로 질환을 진단하지 않습니다.
  items.push(tip("moisturize","◌","기본 관리","보습제 성분표 이렇게 읽어보세요",
    "세안 후 피부가 당긴다면 글리세린·세라마이드·히알루론산 등이 든 보습제를 선택해 보세요. 유분이 많다고 느끼면 가벼운 제형, 건조함이 느껴지면 크림 제형이 편할 수 있어요.",
    "연결 단서: 사용자에게 유분·수분 상태를 직접 묻지 않아 일반 상식으로 제공",SOURCES.moisturizing));
  items.push(tip("sunscreen","☼","기본 관리","자외선 보호는 매일의 기본이에요",
    "야외에서는 광범위 SPF 30 이상 차단제를 사용하고 필요할 때 덧발라 주세요. 사진의 피부색만으로 자외선 손상이나 색소침착 여부를 판단할 수는 없습니다.",
    "연결 단서: 모든 피부를 위한 기본 보호",SOURCES.sunscreen));
  items.push(tip("patch-test","✓","제품 사용 팁","새 제품은 소량으로 먼저 시험해요",
    "새 성분을 여러 개 한꺼번에 사용하지 말고, 팔 안쪽 등 좁은 부위에 제품 설명에 따라 7~10일 정도 시험해 보세요. 붉어짐·가려움·부기가 생기면 사용을 중단하세요.",
    "연결 단서: 사진에서 피부 민감도는 측정할 수 없음",SOURCES.patch));
  // 세부 특징을 우선 표시하되 모든 사진에 적어도 하나의 기본 관리 팁을 포함.
  const cards=items.slice(0,4);
  if(!cards.some(card=>["moisturize","sunscreen","patch-test"].includes(card.id))){
    cards[3]=items.find(card=>card.id==="sunscreen");
  }
  const summary=hasSkin
    ?`이번 사진에서는 ${visualSource}의 밝기 차이와 미세 무늬를 참고해 관리 정보를 골랐어요. ${observations.join(" · ")}.`
    :`이번 사진은 피부 영역을 충분히 구분하기 어려워 촬영 조건과 기본 관리 정보를 우선 안내해요. ${observations.join(" · ")}.`;
  return {
    summary,
    cards,
    visualSource:hasSkin?visualSource:"피부 영역 비교 제한",
    personalized:hasSkin,
    disclaimer:"사진 속 색감·명암·반사만 참고한 관리 상식입니다. 수분량·피지량·민감도·주름·색소침착·여드름·질환을 진단하지 않아요. 새 제품에 자극이 생기거나 피부 변화가 지속된다면 피부과에 상담하세요.",
  };
}
