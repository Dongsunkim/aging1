import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import aitDevtools from "@apps-in-toss/devtools/unplugin";

export default defineConfig({
  // 토스 WebView는 중첩 경로에서 열릴 수 있어 상대 경로 자산을 사용합니다.
  base: "./",
  plugins: [aitDevtools.vite(), react()],
  server: { port: 5173, strictPort: true },
});
