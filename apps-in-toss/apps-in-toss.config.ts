import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  // 앱인토스 콘솔에 생성된 미니앱의 영문 식별자입니다.
  appName: "agingwonder",
  brand: {
    primaryColor: "#7355E8",
  },
  webView: {},
  // HTML 사진 선택 창으로 사용자가 직접 한 장을 선택합니다.
  // 카메라/사진첩 SDK API를 도입하는 경우 해당 권한을 추가해야 합니다.
  permissions: [],
  webBundleDir: "dist",
});
