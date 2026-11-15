import test from "node:test";
import assert from "node:assert/strict";
import { createTossPhotoPicker } from "../apps-in-toss/src/toss-photo-picker.mjs";
import { convertTossAlbumPhotoToFile } from "../apps-in-toss/src/album-photo-file.mjs";

const photo = { dataUri: Buffer.from([0xff,0xd8,0xff,0xe0,0,0x10,0x4a,0x46,0x49,0x46,0,0]).toString("base64") };
test("첫 사진 선택은 재요청 대화상자 없이 SDK의 최초 권한 요청 흐름을 사용한다", async () => {
  let calls = 0;
  const getPhotos = async options => { calls++; assert.deepEqual(options, {base64:true,maxCount:1,maxWidth:1280}); return [photo]; };
  getPhotos.getPermission = () => assert.fail("최초 요청 전에 별도 권한 조회가 필요하지 않다");
  getPhotos.openPermissionDialog = () => assert.fail("최초 요청에서 권한 재요청 대화상자를 사용하면 안 된다");
  const result = await createTossPhotoPicker(getPhotos).open();
  assert.ok(result instanceof File);
  assert.equal(calls, 1);
});
test("권한 거절은 재요청 동작을 표시할 수 있는 코드로 전달하고 동의창을 자동으로 반복하지 않는다", async () => {
  let retries = 0;
  const getPhotos = async () => { throw Object.assign(new Error("사용 동의가 필요해요"), { code: "PERMISSION_DENIED" }); };
  getPhotos.openPermissionDialog = async () => { retries++; return "allowed"; };
  const picker = createTossPhotoPicker(getPhotos);
  await assert.rejects(picker.open(), error => error.code === "PHOTO_PERMISSION_DENIED" && /권한/.test(error.message));
  assert.equal(retries, 0);
  assert.equal(await picker.requestPermission(), true);
  assert.equal(retries, 1);
});
test("이전 iOS NOT_ALLOWED 오류도 사진 권한 거절로 구분한다", async () => {
  const picker = createTossPhotoPicker(async () => { throw { code:"NOT_ALLOWED" }; });
  await assert.rejects(picker.open(), error => error.code === "PHOTO_PERMISSION_DENIED");
});
test("사진 선택 취소 후 다시 선택할 수 있다", async () => {
  let count=0;
  const picker = createTossPhotoPicker(async () => ++count === 1 ? [] : [photo]);
  assert.equal(await picker.open(), null);
  assert.ok(await picker.open() instanceof File);
});
test("동일한 사진 선택 요청이 열려 있는 동안 중복 요청을 만들지 않는다", async () => {
  let finish;
  let count=0;
  const picker = createTossPhotoPicker(() => { count++; return new Promise(resolve => { finish=resolve; }); });
  const first = picker.open();
  assert.equal(await picker.open(), null);
  finish([photo]);
  assert.ok(await first instanceof File);
  assert.equal(count,1);
});
test("기기에서 줄바꿈이나 생략된 패딩을 포함해 반환한 base64 사진도 읽는다", async () => {
  const padded=Buffer.from([0xff,0xd8,0xff,0x00]).toString("base64");
  const file=convertTossAlbumPhotoToFile({dataUri:` ${padded.slice(0,3)}\n${padded.slice(3).replace(/=+$/,"")} `});
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([0xff,0xd8,0xff,0]));
});
test("사진 변환 오류는 권한 오류로 바꾸지 않고 구체적인 안내를 유지한다", async () => {
  const picker=createTossPhotoPicker(async()=>[{dataUri:"!!!"}]);
  await assert.rejects(picker.open(), /크기 또는 형식/);
});
