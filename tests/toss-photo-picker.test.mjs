import test from "node:test";
import assert from "node:assert/strict";
import {
  convertTossAlbumPhotoToFile, explainTossAlbumError,
} from "../apps-in-toss/src/album-photo-file.mjs";

const demoJpg = new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0,0]);
const toBase64=bytes=>Buffer.from(bytes).toString("base64");
test("토스 SDK의 base64 JPEG 응답을 기기 내부 File로 변환",async()=>{
 const file=convertTossAlbumPhotoToFile({dataUri:toBase64(demoJpg)});
 assert.equal(file.name,"toss-selected-photo.jpg");
 assert.equal(file.type,"image/jpeg");
 assert.deepEqual(new Uint8Array(await file.arrayBuffer()),demoJpg);
});
test("SDK 응답에 data URL 접두사가 있어도 지원 형식만 허용",()=>{
 const file=convertTossAlbumPhotoToFile({dataUri:"data:image/png;base64,"+toBase64(new Uint8Array([137,80,78,71]))});
 assert.equal(file.type,"image/png");
 assert.equal(file.name,"toss-selected-photo.png");
 assert.throws(()=>convertTossAlbumPhotoToFile({dataUri:"data:text/html;base64,"+toBase64(demoJpg)}),/지원하지 않는/);
});
test("빈 이미지, 잘못된 인코딩, 12MB 초과 사진을 차단",()=>{
 assert.throws(()=>convertTossAlbumPhotoToFile({dataUri:""}),/데이터가 없습니다/);
 assert.throws(()=>convertTossAlbumPhotoToFile({dataUri:"!!!"}),/크기 또는 형식/);
 assert.throws(()=>convertTossAlbumPhotoToFile({dataUri:"AAAA".repeat(4*1024*1024+100)}),/크기 또는 형식/);
});
test("권한 거절·지원 불가·응답 지연을 서로 다른 한국어 안내로 표현",()=>{
 assert.match(explainTossAlbumError(new Error("NO_PERMISSION")),/권한/);
 assert.match(explainTossAlbumError(new Error("bridge unavailable")),/샘플 테스트 환경/);
 assert.match(explainTossAlbumError(new Error("timeout")),/지연/);
 assert.match(explainTossAlbumError(new Error("user canceled")),/취소/);
});
