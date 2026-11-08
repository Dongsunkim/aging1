"use strict";

import { analyzeVisibleFactors } from "./visual-analysis.js";
import { isAllowedDimensions, safeDisplayName, validatePhotoFile } from "./image-security.js";
import { fingerprintCanvas, assessRepeatedAge, combineAgeEstimates } from "./age-reliability.js";
import { getAppearanceFeedback } from "./appearance-feedback.js";
import { personalizeSkinKnowledge } from "./skin-personalization.js";
import { getExpressionHint, getFunVerdict, getGenderLabel, validateActualAge } from "./verdict.js";

// The regression model is responsible for the estimated age. The separately
// measured skin/hair descriptors are *context*, not unvalidated age adjustments.
const MODEL_BASE = "https://vladmandic.github.io/human-models/models/";
const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35";
const SEGMENTATION_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite";
const $ = (id) => document.getElementById(id);

const ui = {
  fileInput: $("fileInput"), dropZone: $("dropZone"),
  emptyState: $("emptyState"), imageState: $("imageState"),
  previewImage: $("previewImage"), faceOutline: $("faceOutline"),
  fileRow: $("fileRow"), fileName: $("fileName"),
  resetButton: $("resetButton"), analyzeButton: $("analyzeButton"),
  buttonLabel: $("buttonLabel"), buttonIcon: $("buttonIcon"),
  resultIdle: $("resultIdle"), resultLoading: $("resultLoading"),
  resultSuccess: $("resultSuccess"), resultError: $("resultError"),
  ageValue: $("ageValue"), ageNumberWrap: $("ageNumberWrap"),
  ageReliabilityNotice: $("ageReliabilityNotice"), qualityValue: $("qualityValue"),
  loadingTitle: $("loadingTitle"), loadingSub: $("loadingSub"),
  errorMessage: $("errorMessage"), copyButton: $("copyButton"),
  factorsSection: $("factorsSection"),
  factorSkinTone: $("factorSkinTone"), factorSkinTexture: $("factorSkinTexture"),
  factorHair: $("factorHair"), factorLight: $("factorLight"),
  factorsNote: $("factorsNote"), skinNote: $("skinNote"),
  genderField: $("genderField"), ageInput: $("actualAge"),
  genderValue: $("genderValue"), comparisonValue: $("comparisonValue"),
  funTitle: $("funTitle"), funMessage: $("funMessage"),
  factorExpression: $("factorExpression"),
  feedbackSection: $("feedbackSection"),
  skinKnowledgeSection: $("skinKnowledgeSection"),
  skinKnowledgeGrid: $("skinKnowledgeGrid"), skinKnowledgeObservation: $("skinKnowledgeObservation"),
  skinKnowledgeDisclaimer: $("skinKnowledgeDisclaimer"),
  impressionComment: $("impressionComment"),
  improvementComment: $("improvementComment"),
  tipCategory: $("tipCategory"),
  feedbackDisclaimer: $("feedbackDisclaimer"),
};

let objectUrl = null;
let photoRequestId = 0;
let photoIsReady = false;
let busy = false;
let human = null;
let modelLoaded = false;
let segmenter = null;
let lastEstimatedAge = null;
let lastFactors = null;
let lastVerdict = null;
let lastGender = null;
let lastFeedback = null;
let recentAgePredictions = [];
const genderInputs = Array.from(document.querySelectorAll('input[name="userGender"]'));
function selectedGender() { return genderInputs.find((item) => item.checked)?.value ?? null; }
function updateActionButton() {
  const available = photoIsReady && !!selectedGender();
  ui.analyzeButton.disabled = busy || !available;
  ui.buttonLabel.textContent = busy ? "AI 분석 중입니다..." : available ? "결과 보기" : "사진과 성별을 선택해주세요";
}
function invalidateResult() {
  if (busy) return;
  lastEstimatedAge = null;
  lastFactors = null;
  lastVerdict = null;
  lastFeedback = null;
  ui.faceOutline.hidden = true;
  ui.copyButton.textContent = "재미있는 결과 복사하기";
  ui.copyButton.hidden = false;
  ui.ageReliabilityNotice.hidden = true;
  ui.ageNumberWrap.classList.remove("is-uncertain");
  setResultView("idle");
  updateActionButton();
}

function setResultView(name) {
  for (const key of ["Idle", "Loading", "Success", "Error"]) {
    ui[`result${key}`].hidden = key.toLowerCase() !== name;
  }
  ui.factorsSection.hidden = name !== "success";
  ui.feedbackSection.hidden = name !== "success";
  ui.skinKnowledgeSection.hidden = name !== "success";
}
function setBusy(value) {
  busy = value;
  ui.fileInput.disabled = value;
  ui.resetButton.disabled = value;
  ui.ageInput.disabled = value;
  genderInputs.forEach((item) => { item.disabled = value; });
  ui.dropZone.setAttribute("aria-disabled", String(value));
  ui.buttonIcon.textContent = value ? "◌" : "✦";
  updateActionButton();
}
function showError(message) {
  ui.errorMessage.textContent = message;
  setResultView("error");
}
function resetPhoto() {
  if (busy) return;
  photoRequestId += 1;
  photoIsReady = false;
  lastEstimatedAge = null;
  lastFactors = null;
  lastVerdict = null;
  lastFeedback = null;
  ui.fileInput.value = "";
  ui.ageReliabilityNotice.hidden = true;
  ui.ageNumberWrap.classList.remove("is-uncertain");
  ui.copyButton.hidden = false;
  ui.previewImage.removeAttribute("src");
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  ui.emptyState.hidden = false;
  ui.imageState.hidden = true;
  ui.faceOutline.hidden = true;
  ui.fileRow.hidden = true;
  setResultView("idle");
  setBusy(false);
}
async function loadPhoto(file) {
  if (busy || !file) return;
  // 새 파일이 선택되면 이전 비동기 디코딩·미리보기 결과를 무효화합니다.
  resetPhoto();
  const requestId = photoRequestId;
  let nextUrl = null;
  try {
    const fileInfo = await validatePhotoFile(file);
    if (requestId !== photoRequestId) return;

    nextUrl = URL.createObjectURL(file);
    // 실제 디코딩 전에 파일 헤더 크기를 제한하고, 디코딩 결과도 다시 검사합니다.
    const decoded = new Image();
    await new Promise((resolve, reject) => {
      decoded.onload = resolve;
      decoded.onerror = () => reject(new Error("사진을 열지 못했습니다. 다른 사진을 선택해 주세요."));
      decoded.src = nextUrl;
    });
    if (requestId !== photoRequestId) return;
    if (!isAllowedDimensions(decoded.naturalWidth, decoded.naturalHeight)
      || decoded.naturalWidth * decoded.naturalHeight !== fileInfo.width * fileInfo.height) {
      throw new Error("이미지 크기 검증에 실패했습니다. 다른 사진을 선택해 주세요.");
    }

    ui.previewImage.src = nextUrl;
    objectUrl = nextUrl;
    nextUrl = null;
    ui.emptyState.hidden = true;
    ui.imageState.hidden = false;
    ui.fileRow.hidden = false;
    ui.fileName.textContent = `${safeDisplayName(file.name)} · ${(file.size / 1024 / 1024).toFixed(1)}MB`;
    photoIsReady = true;
    setResultView("idle");
    updateActionButton();
  } catch (err) {
    if (requestId === photoRequestId) {
      showError(err instanceof Error ? err.message : "사진을 검증하지 못했습니다. 다시 시도해 주세요.");
      updateActionButton();
    }
  } finally {
    if (nextUrl) URL.revokeObjectURL(nextUrl);
  }
}
function createWorkCanvas() {
  const canvas = document.createElement("canvas");
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(ui.previewImage.naturalWidth, ui.previewImage.naturalHeight));
  canvas.width = Math.max(1, Math.round(ui.previewImage.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(ui.previewImage.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("이미지를 처리할 수 없습니다. 다른 브라우저에서 시도해 주세요.");
  ctx.drawImage(ui.previewImage, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}
async function loadAgeModel() {
  if (modelLoaded && human) return human;
  if (!window.Human || typeof window.Human.Human !== "function") {
    throw new Error("AI 라이브러리를 불러오지 못했습니다. 인터넷 연결이나 광고 차단 설정을 확인해 주세요.");
  }
  human = new window.Human.Human({
    backend: "webgl", debug: false, warmup: "none", modelBasePath: MODEL_BASE,
    cacheSensitivity: 0,
    face: {
      enabled: true,
      detector: { maxDetected: 3, minConfidence: 0.3 },
      mesh: { enabled: true }, iris: { enabled: false },
      attention: { enabled: false }, description: { enabled: true },
      emotion: { enabled: true }, antispoof: { enabled: false },
      liveness: { enabled: false },
    },
    body: { enabled: false }, hand: { enabled: false },
    object: { enabled: false }, gesture: { enabled: false },
    segmentation: { enabled: false },
  });
  await human.load();
  modelLoaded = true;
  return human;
}
async function withTimeout(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function loadSegmenter() {
  if (segmenter) return segmenter;
  // Dynamic import means the large image-segmentation model is downloaded only
  // after a photo has been supplied and an age estimate could be computed.
  const { FilesetResolver, ImageSegmenter } = window.__LOCAL_MEDIAPIPE__ || await import(`${MP_BASE}/vision_bundle.mjs`);
  const vision = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: SEGMENTATION_MODEL, delegate: "CPU" },
    runningMode: "IMAGE",
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });
  return segmenter;
}
function getSegmentationMask(model, canvas) {
  let output = null;
  // Callback keeps the native mask alive while its pixel data is being copied.
  model.segment(canvas, (result) => {
    if (!result.categoryMask) return;
    const mask = result.categoryMask;
    output = {
      width: mask.width,
      height: mask.height,
      pixels: new Uint8Array(mask.getAsUint8Array()),
    };
  });
  if (!output) throw new Error("머리카락·피부 구역을 구분하지 못했습니다.");
  return output;
}
function renderFaceOutline(face) {
  const box = face.boxRaw;
  if (!Array.isArray(box) || box.length < 4 || !box.every(Number.isFinite)) {
    ui.faceOutline.hidden = true;
    return;
  }
  const iw = ui.previewImage.naturalWidth;
  const ih = ui.previewImage.naturalHeight;
  const pw = ui.imageState.clientWidth;
  const ph = ui.imageState.clientHeight;
  const scale = Math.min(pw / iw, ph / ih);
  const renderedW = iw * scale, renderedH = ih * scale;
  const left = (pw - renderedW) / 2 + box[0] * renderedW;
  const top = (ph - renderedH) / 2 + box[1] * renderedH;
  const width = box[2] * renderedW, height = box[3] * renderedH;
  const visibleLeft = Math.max(0, left), visibleTop = Math.max(0, top);
  const visibleWidth = Math.min(width - (visibleLeft - left), pw - visibleLeft);
  const visibleHeight = Math.min(height - (visibleTop - top), ph - visibleTop);
  if (visibleWidth <= 0 || visibleHeight <= 0) return;
  Object.assign(ui.faceOutline.style, {
    left: `${visibleLeft}px`, top: `${visibleTop}px`,
    width: `${visibleWidth}px`, height: `${visibleHeight}px`,
  });
  ui.faceOutline.hidden = false;
}
function qualityHint(face, lightLabel) {
  const box = face.boxRaw;
  if (!Array.isArray(box) || box.length < 4) return lightLabel;
  if (box[2] * box[3] < 0.028) return "얼굴 영역이 작음 · 재촬영 권장";
  if (ui.previewImage.naturalWidth < 350) return "해상도가 낮음 · 재촬영 권장";
  return lightLabel;
}
function renderFactors(factors, segmentationError, expression) {
  ui.factorExpression.textContent = expression.label;
  ui.factorLight.textContent = factors.light?.label || "측정 불가";
  ui.factorSkinTone.textContent = factors.skin?.toneLabel || "측정 불가";
  ui.factorSkinTexture.textContent = factors.skin?.textureLabel || "측정 불가";
  ui.factorHair.textContent = factors.hair?.text || "측정 불가";
  ui.skinNote.textContent = factors.skin?.note || factors.skinSkippedReason || "피부 표면이 충분히 보이지 않아 피부결·색감 측정을 생략했습니다.";
  if (segmentationError) {
    ui.factorsNote.textContent = "피부·모발 분할 모델을 불러오지 못해 머리카락 영역 측정을 생략했습니다. 피부결 항목이 표시된다면 볼 영역의 제한적인 사진 관찰값이며 정확한 피부 상태는 아닙니다.";
  } else {
    ui.factorsNote.textContent = `${expression.note} ${factors.hair?.note || "머리카락 영역을 확인하지 못했습니다."} ${factors.light?.note || ""}`;
  }
}
function renderSkinKnowledge(factors) {
  const advice = personalizeSkinKnowledge(factors);
  ui.skinKnowledgeObservation.textContent = advice.summary;
  ui.skinKnowledgeDisclaimer.textContent = advice.disclaimer;
  // 사용자 사진이나 분석 문자열은 HTML로 삽입하지 않습니다.
  // 텍스트 노드만 사용하고 외부 자료 링크는 사전 정의된 AAD 주소만 허용합니다.
  const nodes = advice.cards.map(item => {
    const card = document.createElement("article");
    card.className = "skin-knowledge-item";
    card.dataset.skinTip = item.id;
    const icon = document.createElement("div");
    icon.className = "skin-knowledge-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = item.icon;
    const body = document.createElement("div");
    body.className = "skin-knowledge-body";
    const tag = document.createElement("span");
    tag.className = "skin-knowledge-tag";
    tag.textContent = item.tag;
    const title = document.createElement("h3");
    title.textContent = item.title;
    const reason = document.createElement("p");
    reason.className = "skin-knowledge-reason";
    reason.textContent = item.because;
    const description = document.createElement("p");
    description.textContent = item.body;
    const link = document.createElement("a");
    const validUrl = new URL(item.sourceUrl);
    if (validUrl.origin !== "https://www.aad.org") {
      throw new Error("피부 건강 자료 출처를 확인할 수 없습니다.");
    }
    link.href = validUrl.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "피부과학회 자료 보기";
    body.append(tag, title, reason, description, link);
    card.append(icon, body);
    return card;
  });
  ui.skinKnowledgeGrid.replaceChildren(...nodes);
}

async function analyzePhoto() {
  if (!photoIsReady || busy || !selectedGender()) return;
  const ageValidation = validateActualAge(ui.ageInput.value);
  if (!ageValidation.valid) {
    ui.ageInput.setAttribute("aria-invalid", "true");
    showError(ageValidation.message);
    ui.ageInput.focus();
    return;
  }
  ui.ageInput.removeAttribute("aria-invalid");
  const gender = selectedGender();
  setBusy(true);
  setResultView("loading");
  ui.loadingTitle.textContent = modelLoaded ? "얼굴의 시각적 특징 분석 중" : "AI 모델을 준비하는 중...";
  ui.loadingSub.textContent = "첫 실행에는 AI 파일 다운로드가 필요할 수 있습니다.";
  ui.faceOutline.hidden = true;
  try {
    const { canvas, ctx } = createWorkCanvas();
    const photoFingerprint = fingerprintCanvas(canvas);
    const model = await loadAgeModel();
    ui.loadingTitle.textContent = "AI 외모 나이를 추정 중...";
    ui.loadingSub.textContent = "얼굴 전체의 시각적 특징을 분석합니다.";
    const result = await model.detect(canvas, {face: {description: {enabled: true}, ssrnet: {enabled: false}, gear: {enabled: false}}});
    const faces = Array.isArray(result.face) ? result.face : [];
    if (!faces.length) throw new Error("얼굴을 찾지 못했습니다. 정면을 바라보는 선명한 사진으로 다시 시도해 주세요.");
    if (faces.length > 1) throw new Error("얼굴이 두 개 이상 감지되었습니다. 한 사람만 나온 사진으로 시도해 주세요.");
    const face = faces[0];
    if (!Number.isFinite(face.age) || face.age < 1 || face.age > 100) {
      throw new Error("이 사진에서는 외모 나이를 안정적으로 추정하지 못했습니다. 다른 사진으로 시도해 주세요.");
    }
    // 서로 다른 세 모델의 예측을 집계합니다. 중앙값은 특정 모델의 극단적인
    // 결과가 전체 숫자를 좌우하는 위험을 완화하는 임시 규칙이며,
    // 실제 나이에 대한 정확도 향상은 검증된 한국 연령 데이터로 평가해야 합니다.
    ui.loadingTitle.textContent = "세 가지 AI 모델로 나이를 분석 중...";
    ui.loadingSub.textContent = "모델별 예측을 비교해 하나의 외모 나이로 정리하고 있습니다.";
    let secondaryAge = null;
    let tertiaryAge = null;
    let secondaryTimedOut = false;
    try {
      const second = await withTimeout(model.detect(canvas, {
        face: {
          description: {enabled: false},
          gear: {enabled: false},
          ssrnet: {
            enabled: true,
            modelPathAge: "age.json",
            modelPathGender: "gender-ssrnet-imdb.json",
            skipFrames: 0, skipTime: 0,
          },
        },
      }), 18000, "보조 나이 모델 응답 지연");
      if (Array.isArray(second.face) && second.face.length === 1
        && Number.isFinite(second.face[0].age) && second.face[0].age >= 1 && second.face[0].age <= 100) {
        secondaryAge = second.face[0].age;
      }
    } catch (err) {
      secondaryTimedOut = String(err).includes("응답 지연");
      console.warn("SSR-Net 나이 모델 결과를 받지 못했습니다:", err);
    }
    // 중단된 모델이 여전히 추론 중일 때 동일 인스턴스를 병렬 사용하지 않습니다.
    if (!secondaryTimedOut) {
      try {
        const third = await withTimeout(model.detect(canvas, {
          face: {
            description: {enabled: false},
            ssrnet: {enabled: false},
            gear: {enabled: true, modelPath: "gear.json", skipFrames: 0, skipTime: 0},
          },
        }), 18000, "세 번째 나이 모델 응답 지연");
        if (Array.isArray(third.face) && third.face.length === 1
          && Number.isFinite(third.face[0].age) && third.face[0].age >= 1 && third.face[0].age <= 100) {
          tertiaryAge = third.face[0].age;
        }
      } catch (err) {
        console.warn("GEAR 나이 모델 결과를 받지 못했습니다:", err);
      }
    }
    const estimation = combineAgeEstimates({
      faceres: face.age,
      ssrnet: secondaryAge,
      gear: tertiaryAge,
    });
    const ageAudit = assessRepeatedAge(recentAgePredictions, photoFingerprint, estimation.rawEstimate);
    recentAgePredictions = ageAudit.history;
    if (!ageAudit.valid) throw new Error("AI 나이 추정 결과를 확인하지 못했습니다.");
    ui.loadingTitle.textContent = "피부·머리카락 영역 분석 중...";
    ui.loadingSub.textContent = "표면 명암과 가시적 모발 영역을 살펴보고 있습니다.";
    // Not mandatory for an age estimate: if segmentation fails, show a clearly
    // marked partial result instead of synthesizing fake skin/hair findings.
    let mask = null;
    let segmentationError = null;
    try {
      const regionModel = await withTimeout(loadSegmenter(), 10000, "피부·모발 분석 모델이 지연되어 참고 분석을 생략했습니다.");
      mask = getSegmentationMask(regionModel, canvas);
    } catch (err) {
      console.warn("Optional skin/hair segmentation unavailable:", err);
      segmentationError = err;
      // Retry the optional model on the next analysis; do not permanently hide it.
      segmenter = null;
    }
    const factors = analyzeVisibleFactors(ctx.getImageData(0, 0, canvas.width, canvas.height), face, mask);
    lastEstimatedAge = estimation.age;
    lastFactors = factors;
    lastGender = gender;
    const expression = getExpressionHint(face.emotion);
    lastVerdict = getFunVerdict(lastEstimatedAge, ageValidation.age);
    ui.funTitle.textContent = lastVerdict.title;
    ui.funMessage.textContent = lastVerdict.message;
    ui.genderValue.textContent = getGenderLabel(gender);
    ui.comparisonValue.textContent = lastVerdict.comparison;
    // 유효한 나이 모델의 응답이 하나라도 있다면 항상 숫자를 표시합니다.
    ui.ageValue.textContent = String(lastEstimatedAge);
    ui.ageNumberWrap.classList.remove("is-uncertain");
    ui.copyButton.hidden = false;
    ui.ageReliabilityNotice.hidden = false;
    const spreadNote = estimation.count > 1
      ? `모델 간 예측값의 최대 차이는 약 ${Math.round(estimation.spread)}세입니다.`
      : "다른 모델의 결과를 받지 못해 한 모델의 추정값만 사용했습니다.";
    const repeatNote = ageAudit.repeated
      ? " 다른 사진에서도 비슷한 결과가 반복되어 참고에 주의해 주세요."
      : "";
    ui.ageReliabilityNotice.textContent =
      `AI가 ${estimation.method} 방식으로 ${lastEstimatedAge}세를 추정했어요. ${spreadNote}${repeatNote} 정확한 실제 나이 판정은 아니며 촬영 환경에 따라 달라질 수 있어요.`;
    ui.qualityValue.textContent = qualityHint(face, factors.light.label);
    if (estimation.disagreement) {
      ui.qualityValue.textContent += " · 모델 간 예측 차이 큼";
    }
    if (factors.photoQuality?.ageWarning) {
      ui.qualityValue.textContent += " · 사진 품질 확인 권장";
      ui.ageReliabilityNotice.textContent += ` 사진 상태: ${factors.photoQuality.ageWarning}. 같은 얼굴도 사진 조건에 따라 결과가 달라질 수 있습니다.`;
    }
    renderFactors(factors, segmentationError, expression);
    renderSkinKnowledge(factors);
    lastFeedback = getAppearanceFeedback(expression, factors, ui.qualityValue.textContent);
    ui.impressionComment.textContent = lastFeedback.impression;
    ui.improvementComment.textContent = lastFeedback.tip;
    ui.tipCategory.textContent = `· ${lastFeedback.tipCategory}`;
    ui.feedbackDisclaimer.textContent = lastFeedback.disclaimer;
    setResultView("success");
    renderFaceOutline(face);
  } catch (err) {
    console.error("Age estimation failed:", err);
    showError(err instanceof Error ? err.message : "분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
    if (!modelLoaded) human = null;
  } finally {
    setBusy(false);
  }
}

ui.dropZone.addEventListener("click", () => { if (!busy) ui.fileInput.click(); });
ui.dropZone.addEventListener("keydown", (event) => {
  if (!busy && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault(); ui.fileInput.click();
  }
});
ui.fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadPhoto(file);
});
for (const eventName of ["dragenter", "dragover"]) {
  ui.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!busy) ui.dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  ui.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault(); ui.dropZone.classList.remove("dragging");
  });
}
ui.dropZone.addEventListener("drop", (event) => {
  if (!busy) loadPhoto(event.dataTransfer?.files?.[0]);
});
ui.resetButton.addEventListener("click", () => { resetPhoto(); ui.fileInput.click(); });
ui.analyzeButton.addEventListener("click", analyzePhoto);
for (const radio of genderInputs) radio.addEventListener("change", invalidateResult);
ui.ageInput.addEventListener("input", () => {
  ui.ageInput.removeAttribute("aria-invalid");
  invalidateResult();
});
ui.copyButton.addEventListener("click", async () => {
  if (!Number.isFinite(lastEstimatedAge) || !lastVerdict) return;
  const message = `몇살로보여? ✨\nAI가 추정한 외모 나이: ${lastEstimatedAge}세\n${lastVerdict.title} ${lastVerdict.message}\n첫인상: ${lastFeedback?.impression || "분석 정보 없음"}\n관리 팁: ${lastFeedback?.tip || "분석 정보 없음"}\n피부 건강 상식: 보습 성분, 레티놀, 색소침착, 모공 관리, 새 제품 테스트를 확인해 보세요.\n(선택 성별: ${getGenderLabel(lastGender)}, 나이 비교: ${lastVerdict.comparison})\n※ 사진 한 장으로 판단한 재미용 AI 예측이며 실제 나이/건강 진단은 아닙니다.`;
  try {
    await navigator.clipboard.writeText(message);
    ui.copyButton.textContent = "복사 완료 ✓";
  } catch {
    ui.copyButton.textContent = `추정 외모 나이: ${lastEstimatedAge}세`;
  }
});
resetPhoto();