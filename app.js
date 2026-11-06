"use strict";

import { analyzeVisibleFactors } from "./visual-analysis.js";
import { isAllowedDimensions, safeDisplayName, validatePhotoFile } from "./image-security.js";
import { fingerprintCanvas, assessRepeatedAge, compareAgeModels } from "./age-reliability.js";
import { getAppearanceFeedback } from "./appearance-feedback.js";
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
  ui.skinNote.textContent = factors.skin?.note || "피부로 분류된 영역이 충분하지 않아 피부결·색감 측정을 생략했습니다.";
  if (segmentationError) {
    ui.factorsNote.textContent = "피부·모발 분할 모델을 불러오지 못해 상세 항목을 생략했습니다. 나이 값은 얼굴 나이 모델로 별도 계산했습니다. ";
  } else {
    ui.factorsNote.textContent = `${expression.note} ${factors.hair?.note || "머리카락 영역을 확인하지 못했습니다."} ${factors.light?.note || ""}`;
  }
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
    const result = await model.detect(canvas, {face: {description: {enabled: true}, ssrnet: {enabled: false}}});
    const faces = Array.isArray(result.face) ? result.face : [];
    if (!faces.length) throw new Error("얼굴을 찾지 못했습니다. 정면을 바라보는 선명한 사진으로 다시 시도해 주세요.");
    if (faces.length > 1) throw new Error("얼굴이 두 개 이상 감지되었습니다. 한 사람만 나온 사진으로 시도해 주세요.");
    const face = faces[0];
    if (!Number.isFinite(face.age) || face.age < 1 || face.age > 100) {
      throw new Error("이 사진에서는 외모 나이를 안정적으로 추정하지 못했습니다. 다른 사진으로 시도해 주세요.");
    }
    // 동일 Human 인스턴스에서 별도의 SSR-Net 나이 모델을 실행합니다.
    // 더 많은 값을 평균하거나 임의 보정하지 않고 모델 간 예측 차이를 확인합니다.
    ui.loadingTitle.textContent = "서로 다른 AI 모델의 결과 비교 중...";
    ui.loadingSub.textContent = "정확성이 낮아 보이는 숫자를 걸러내고 있습니다.";
    let secondaryAge = null;
    let secondaryError = null;
    try {
      const second = await withTimeout(model.detect(canvas, {
        face: {
          description: {enabled: false},
          ssrnet: {
            enabled: true,
            modelPathAge: "age.json",
            modelPathGender: "gender-ssrnet-imdb.json",
            skipFrames: 0, skipTime: 0,
          },
        },
      }), 18000, "두 번째 모델 응답이 지연됐습니다.");
      if (Array.isArray(second.face) && second.face.length === 1
        && Number.isFinite(second.face[0].age) && second.face[0].age >= 1 && second.face[0].age <= 100) {
        secondaryAge = second.face[0].age;
      } else {
        secondaryError = new Error("두 번째 모델의 나이 결과가 유효하지 않습니다.");
      }
    } catch (err) {
      secondaryError = err;
      console.warn("나이 모델 교차 검증 실패:", err);
    }
    const comparison = compareAgeModels(face.age, secondaryAge);
    // 사진별 나이가 고정되는 오류 및 모델별 예측 불일치를 구분합니다.
    const ageAudit = assessRepeatedAge(recentAgePredictions, photoFingerprint, face.age);
    recentAgePredictions = ageAudit.history;
    if (!ageAudit.valid) {
      throw new Error("나이 모델의 결과를 확인하지 못했습니다. 다른 사진으로 다시 시도해 주세요.");
    }
    const uncertainAge = ageAudit.repeated || comparison.disagreement
      || (Math.round(face.age) <= 17 && !comparison.available);
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
    lastEstimatedAge = uncertainAge ? null : Math.round(face.age);
    lastFactors = factors;
    lastGender = gender;
    const expression = getExpressionHint(face.emotion);
    lastVerdict = uncertainAge
      ? {
          title: "이 사진은 나이를 확정하기 어려워요",
          message: "두 모델이 같은 사진에서 서로 다른 나이를 예측했습니다. 실제 얼굴 나이처럼 단정하지 않고 결과를 보류합니다.",
          comparison: "AI 나이 판단 보류",
        }
      : getFunVerdict(lastEstimatedAge, ageValidation.age);
    if (!uncertainAge && Math.round(face.age) <= 17
      && ageValidation.age !== null && ageValidation.age - face.age >= 10) {
      lastVerdict = {
        title: "나이 추정값을 다시 확인해 주세요",
        message: "AI가 매우 낮은 나이를 예측했어요. 사진에 따라 오차가 클 수 있어 동안 여부를 단정하지 않습니다.",
        comparison: "모델의 저연령 예측 · 확인 필요",
      };
    }
    ui.funTitle.textContent = lastVerdict.title;
    ui.funMessage.textContent = lastVerdict.message;
    ui.genderValue.textContent = getGenderLabel(gender);
    ui.comparisonValue.textContent = lastVerdict.comparison;
    ui.ageValue.textContent = uncertainAge ? "판단 어려움" : String(lastEstimatedAge);
    ui.ageNumberWrap.classList.toggle("is-uncertain", uncertainAge);
    ui.copyButton.hidden = uncertainAge;
    ui.ageReliabilityNotice.hidden = false;
    if (uncertainAge) {
      const detail = ageAudit.repeated
        ? "서로 다른 사진에서 같은 나이가 반복돼 AI 결과를 신뢰하기 어렵습니다."
        : comparison.disagreement
          ? `독립적인 두 모델의 나이 추정에 약 ${Math.round(comparison.gap)}세 차이가 있습니다.`
          : "추정 나이가 매우 낮지만 다른 모델로 검증하지 못했습니다.";
      ui.ageReliabilityNotice.textContent =
        `${detail} 정면·균일한 조명의 선명한 사진으로 다시 시도해 주세요. 잘못된 숫자를 대신 표시하지 않습니다.`;
    } else if (comparison.available) {
      ui.ageReliabilityNotice.textContent =
        `두 모델의 추정값 차이: 약 ${Math.round(comparison.gap)}세. 이 결과는 오락용 참고값이며 실제 나이의 정확한 측정이 아닙니다.`;
    } else {
      ui.ageReliabilityNotice.textContent =
        "보조 AI 모델 확인이 지연돼 한 모델의 추정값만 표시합니다. 실제 나이를 객관적으로 판정한 결과는 아닙니다.";
    }
    ui.qualityValue.textContent = qualityHint(face, factors.light.label);
    if (uncertainAge) {
      ui.qualityValue.textContent = "나이 모델 결과 재확인 권장";
    } else if (Math.round(face.age) <= 17) {
      ui.qualityValue.textContent += " · 낮은 나이 추정 재확인 권장";
    }
    renderFactors(factors, segmentationError, expression);
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