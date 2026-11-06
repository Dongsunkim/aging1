import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  // 앱인토스 콘솔에서 만든 앱의 영문 식별자로 반드시 변경하세요.
  // 현재 값은 GitHub 저장소 이름을 임시로 사용한 것입니다.
  appName: "aging1",
  brand: {
    primaryColor: "#7355E8",
  },
  webView: {},
  // HTML 사진 선택 창으로 사용자가 직접 한 장을 선택합니다.
  // 카메라/사진첩 SDK API를 도입하는 경우 해당 권한을 추가해야 합니다.
  permissions: [],
  webBundleDir: "dist",
});
