# 앱인토스 사진 선택 오류 수정

대상 서비스: **몇살로보여?**, 앱인토스 식별자: `agingwonder`.

검수 피드백: “서비스 핵심 기능인 이미지 업로드 기능이 정상 작동하지 않아 서비스를 정상적으로 이용할 수 없어요.”

## 변경한 동작

- 첫 사진 선택은 `Device.getPhotos()`를 호출합니다. SDK가 최초 권한 요청과 앨범 열기를 처리하도록 했습니다. 이전 구현은 `notDetermined`인 경우에도 재요청용 `openPermissionDialog()`를 먼저 호출하여 사진 선택에 도달하지 못할 수 있었습니다.
- 권한 거절 시에만 **사진 권한 다시 요청** 버튼을 표시합니다. 동의를 거절한 직후 자동으로 다시 요청하지 않습니다.
- 오류의 메시지뿐 아니라 `PERMISSION_DENIED`, `NOT_ALLOWED` 코드와 권한 오류 이름을 확인합니다.
- 사진 선택 취소를 실패와 구분하고 기존 사진을 유지합니다.
- 기기의 base64 응답에 줄바꿈이 있거나 패딩이 생략되어도 사진을 읽을 수 있습니다. 파일 크기·인코딩·형식·해상도 검증은 유지합니다.
- 일반 브라우저에서는 HTML 파일 선택창과 일반 TDS Provider를 사용하고, 토스 WebView에서만 네이티브 사진첩을 연결합니다.
- 사진은 기존대로 기기 내에서 처리합니다. 사진 업로드 서버나 사진 저장 기능을 추가하지 않았습니다.

## 재현 및 검증

```sh
node --test tests/*.test.mjs
cd apps-in-toss
npm ci
npm run build
cd ..
node tests/photo-upload-browser.mjs
```

브라우저 검증은 Playwright와 설치된 Chromium이 필요합니다. 테스트에는 인물이 없는 128×128 합성 이미지를 사용합니다. 네이티브 사진 API의 응답을 모의하고 실제 이미지 검증·디코딩·미리보기·성별 선택 후 분석 버튼 활성화까지 확인합니다. 이는 휴대전화의 사진첩 권한 UI를 실제 검증한 결과와 구분해야 합니다. AI 모델 추론은 이 사진 선택 회귀 테스트의 범위가 아닙니다.

## 콘솔 재제출 전 실제 기기에서 확인

1. 생성된 최신 `apps-in-toss/agingwonder.ait`를 `agingwonder` 앱에 업로드합니다. 이전 번들의 테스트 링크를 재사용하지 말고 새 번들의 QR·테스트 스킴으로 실행합니다.
2. Android와 iOS에서 첫 이용의 사진 동의 → 사진 선택 → 미리보기 → 성별 선택 → 결과 보기 흐름을 확인합니다.
3. 사진 권한을 거절한 경우, 안내와 권한 다시 요청 버튼이 표시되고 허용 후 사진을 선택할 수 있는지 확인합니다.
4. 사진 선택 취소, 다른 사진으로 변경, 손상된 파일, 큰 사진, iOS의 제한된 사진 접근 상태를 확인합니다.
5. 사진은 표시되는데 분석만 실패하면 사진 선택 오류와 구분해 모델 다운로드·네트워크·메모리 상태를 확인합니다.

현재 검수 문구만으로 Android/iOS 중 어느 기기, 어떤 사진, 어느 단계에서 실패했는지는 확정할 수 없습니다. 이 수정은 코드에서 확인한 권한 요청 흐름과 사진 응답 처리 문제를 해결하며, 최종 확인에는 콘솔의 새 번들 테스트가 필요합니다.

참고: [공식 사진 선택 API](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/device/device.getphotos.md), [권한 재요청 API](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/permissions/openpermissiondialog.md).
