import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@toss/tds-mobile";
import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";
import Human from "@vladmandic/human";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
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

// 기존 앱은 DOM과 모델 로드를 사용하므로 HTML이 준비된 다음 가져옵니다.
void import("../../app.js").catch((error: unknown) => {
  console.error("얼굴 분석 모듈을 열지 못했습니다.", error);
  const text = document.getElementById("buttonLabel");
  if (text) text.textContent = "분석 화면을 불러오지 못했습니다. 다시 열어주세요.";
});
