import test from "node:test";
import assert from "node:assert/strict";
import { inspectImageHeader, validatePhotoFile, isAllowedDimensions, safeDisplayName } from "../image-security.js";

function samplePNG(width = 400, height = 400) {
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(16,width); dv.setUint32(20,height);
  bytes[24]=8; bytes[25]=2;
  return new Blob([bytes], { type:"image/png" });
}

test("정상 PNG 헤더는 허용한다", async () => {
  const file = samplePNG();
  assert.deepEqual(await validatePhotoFile(file), { type: "image/png", width:400, height:400 });
});
test("가짜 이미지 데이터는 확장자에 관계없이 거부한다", async () => {
  const file = new Blob(["<script>alert(1)</script>"], {type:"image/png"});
  await assert.rejects(validatePhotoFile(file), /형식|손상/);
});
test("헤더와 MIME 유형이 다르면 거부한다", async () => {
  const png = samplePNG();
  const file = new Blob([await png.arrayBuffer()], {type:"image/jpeg"});
  await assert.rejects(validatePhotoFile(file), /형식/);
});
test("초고해상도·픽셀 과다 파일을 거부한다", async () => {
  await assert.rejects(validatePhotoFile(samplePNG(8192,8192)), /이미지 크기/);
  await assert.rejects(validatePhotoFile(samplePNG(9000,100)), /이미지 크기/);
  assert.equal(isAllowedDimensions(960,960), true);
  assert.equal(isAllowedDimensions(100,0), false);
});
test("JPEG SOF 마커에서 실제 크기를 읽는다", () => {
  const a = new Uint8Array(24);
  a.set([255,216,255,224,0,4,0,0,255,192,0,17,8,1,144,1,144]);
  assert.deepEqual(inspectImageHeader(a), {type:"image/jpeg",width:400,height:400});
});
test("WebP의 RIFF 서명 및 크기를 읽는다", () => {
  const a = new Uint8Array(30);
  a.set([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88]);
  a[20]=0; a[24]=0x8f; a[25]=0x01; a[27]=0x8f; a[28]=0x01;
  assert.deepEqual(inspectImageHeader(a), {type:"image/webp",width:400,height:400});
  a[20]=0x02;assert.equal(inspectImageHeader(a),null);
});
test("파일 이름의 제어 문자를 제거하고 길이를 제한한다", () => {
  assert.equal(safeDisplayName("a\u0000b\n.jpg"),"ab.jpg");
  assert.equal(safeDisplayName("x".repeat(200)).length,80);
});
