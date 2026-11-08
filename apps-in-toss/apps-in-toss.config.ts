import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  // 앱인토스 콘솔에 생성된 미니앱의 영문 식별자입니다.
  appName: "agingwonder",
  brand: {
    primaryColor: "#7355E8",
  },
  webView: {},
  // 토스 WebView에서는 네이티브 사진첩 SDK로 한 장을 가져옵니다.
  // 기본 웹앱은 기존 파일 선택 방식으로 동작합니다.
  permissions: [{ name: "photos", access: "read" }],
  webBundleDir: "dist",
});
