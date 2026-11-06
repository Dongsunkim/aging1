import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(projectDir, "..");
let html = await readFile(resolve(webDir, "index.html"), "utf8");

function replaceOnce(source, replacement, description) {
  const parts = html.split(source);
  if (parts.length !== 2) {
    throw new Error(`기존 웹앱의 ${description} 구조가 변경되었습니다. 변환 규칙을 확인하세요.`);
  }
  html = html.replace(source, replacement);
}

// 기존 웹앱의 HTML/CSS/JS를 한 번만 관리하고,
// 앱인토스용 빌드에서는 TDS 메인 버튼과 번들러를 적용합니다.
replaceOnce(
  '<link rel="stylesheet" href="./style.css" />',
  "",
  "스타일시트"
);
replaceOnce(
  '<script type="module" src="./app.js"></script>',
  '<script type="module" src="./src/tds-entry.tsx"></script>',
  "스크립트"
);
replaceOnce(
  '<button id="analyzeButton" class="primary-button" type="button" disabled>',
  '<div id="tossAnalyzeRoot" class="toss-action"></div>\n            <button id="analyzeButton" class="primary-button" type="button" disabled hidden style="display:none">',
  "결과 보기 버튼"
);
await writeFile(resolve(projectDir, "index.html"), html);
console.log("앱인토스용 화면 파일 생성 완료");
