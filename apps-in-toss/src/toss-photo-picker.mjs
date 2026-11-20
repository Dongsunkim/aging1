import { convertTossAlbumPhotoToFile, explainTossAlbumError, isTossAlbumPermissionError } from "./album-photo-file.mjs";

// The SDK requests initial consent itself. openPermissionDialog is a recovery
// action for a previously denied permission, not the initial request API.
export function createTossPhotoPicker(getPhotos) {
  let choosing = false;
  return {
    async open(onStatus = () => {}) {
      if (choosing) return null;
      choosing = true;
      let converting = false;
      try {
        onStatus("사진 선택창을 여는 중입니다. 처음 이용하면 사진 접근 동의가 표시돼요.");
        const photos = await getPhotos({ base64: true, maxCount: 1, maxWidth: 1280 });
        if (!Array.isArray(photos)) throw new Error("invalid album response");
        if (!photos.length) return null;
        converting = true;
        onStatus("선택한 사진을 확인하고 있습니다.");
        return convertTossAlbumPhotoToFile(photos[0]);
      } catch (cause) {
        const error = new Error(converting && cause instanceof Error ? cause.message : explainTossAlbumError(cause));
        if (isTossAlbumPermissionError(cause)) error.code = "PHOTO_PERMISSION_DENIED";
        throw error;
      } finally { choosing = false; }
    },
    async requestPermission(onStatus = () => {}) {
      onStatus("사진 접근 권한을 다시 요청합니다. 휴대전화의 안내를 확인해 주세요.");
      try {
        const status = await getPhotos.openPermissionDialog();
        if (status !== "allowed" && status !== "limited") {
          const error = new Error("사진 접근이 허용되지 않았어요. 휴대전화 설정에서 토스의 사진 접근 권한을 확인해 주세요.");
          error.code = "PHOTO_PERMISSION_DENIED";
          throw error;
        }
        return true;
      } catch (cause) {
        const error = new Error(explainTossAlbumError(cause));
        if (isTossAlbumPermissionError(cause)) error.code = "PHOTO_PERMISSION_DENIED";
        throw error;
      }
    },
  };
}
