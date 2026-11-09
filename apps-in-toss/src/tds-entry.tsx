import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@toss/tds-mobile";
import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";
import Human from "@vladmandic/human";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { fetchAlbumPhotos } from "@apps-in-toss/web-framework";
import { convertTossAlbumPhotoToFile, explainTossAlbumError } from "./album-photo-file.mjs";
import "../../style.css";
import "./tds-bridge.css";

// 기존 얼굴 분석 프로그램을 유지하면서, 핵심 버튼은 TDS로 표시합니다.
// 숨겨진 기본 버튼은 실제 분석 이벤트와 비활성 상태의 단일 원본입니다.
function AnalyzeAction() {
  const [disabled, setDisabled] = useState(true);
  const [label, setLabel] = useState("사진과 성별을 선택해주세요");

  useEffect(() => {
    const source = document.getElementById("analyzeButton") as HTMLButtonElement | null;
    const labelNode = document.getElementById("buttonLabel");
    if (!source || !labelNode) return;

    const sync = () => {
      setDisabled(source.disabled);
      setLabel(labelNode.textContent?.trim() || "결과 보기");
    };
    const observer = new MutationObserver(sync);
    observer.observe(source, { attributes: true, attributeFilter: ["disabled"] });
    observer.observe(labelNode, { childList: true, characterData: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  const runAnalysis = () => {
    const source = document.getElementById("analyzeButton") as HTMLButtonElement | null;
    if (source && !source.disabled) source.click();
  };
  return (
    <Button variant="fill" disabled={disabled} onClick={runAnalysis}>
      {label}
    </Button>
  );
}

const root = document.getElementById("tossAnalyzeRoot");
if (!root) throw new Error("결과 버튼 영역을 찾지 못했습니다.");

createRoot(root).render(
  <TDSMobileAITProvider>
    <AnalyzeAction />
  </TDSMobileAITProvider>
);

// 토스 번들에 포함한 검증 가능한 패키지만 사용합니다.
// 앱에서 사진은 기기 내부의 Canvas에만 전달되며 별도 사진 업로드 API는 없습니다.
(window as any).Human = { Human };
(window as any).__LOCAL_MEDIAPIPE__ = { FilesetResolver, ImageSegmenter };

// HTML input[type=file]의 .click()은 토스 WebView에서 네이티브 사진 선택창을
// 열지 못할 수 있습니다. 미니앱에서만 공식 사진첩 SDK를 연결합니다.
let choosingAlbum = false;
(window as any).__TOSS_OPEN_ALBUM__ = async (onStatus?: (message: string) => void): Promise<File | null> => {
  if (choosingAlbum) return null;
  choosingAlbum = true;
  let stage = "SDK 권한 확인";
  try {
    onStatus?.("토스 사진첩 권한을 확인하는 중입니다.");
    const current = await fetchAlbumPhotos.getPermission();
    if (current !== "allowed" && current !== "limited") {
      stage = "앱 사진첩 권한 요청";
      onStatus?.("사진첩 접근 권한을 요청하고 있습니다. 권한 안내창을 확인해 주세요.");
      const granted = await fetchAlbumPhotos.openPermissionDialog();
      if (granted !== "allowed" && granted !== "limited") {
        throw new Error("permission denied");
      }
    }
    stage = "네이티브 사진첩 열기";
    onStatus?.("권한 확인 완료 · 갤럭시 사진첩을 여는 중입니다.");
    const photos = await fetchAlbumPhotos({
      base64: true,
      maxCount: 1,
      maxWidth: 1280,
    });
    if (!Array.isArray(photos) || photos.length === 0) {
      onStatus?.("사진이 선택되지 않았습니다. 다시 눌러주세요.");
      return null;
    }
    stage = "선택 사진 변환";
    onStatus?.("선택한 사진을 분석용으로 준비하고 있습니다.");
    return convertTossAlbumPhotoToFile(photos[0]);
  } catch (error) {
    console.warn("토스 사진첩 선택 실패:", stage, error);
    throw new Error(`${stage} 단계: ${explainTossAlbumError(error)}`);
  } finally {
    choosingAlbum = false;
  }
};

// 기존 앱은 DOM과 모델 로드를 사용하므로 HTML이 준비된 다음 가져옵니다.
void import("../../app.js").catch((error: unknown) => {
  console.error("얼굴 분석 모듈을 열지 못했습니다.", error);
  const text = document.getElementById("buttonLabel");
  if (text) text.textContent = "분석 화면을 불러오지 못했습니다. 다시 열어주세요.";
});
