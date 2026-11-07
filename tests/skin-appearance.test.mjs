import test from "node:test";
import assert from "node:assert/strict";
import { measureSkinAppearance, analyzeVisibleFactors } from "../visual-analysis.js";

function sampleImage(width=480,height=480){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const k=(y*width+x)*4;
  // 확실히 정의된 가상 피부 패턴: 실제 사진은 포함하지 않습니다.
  const value=110+(Math.floor(x/12)%2)*30+(Math.floor(y/8)%3)*10;
  data[k]=value;data[k+1]=value+3;data[k+2]=value+5;data[k+3]=255;
 }
 return {width,height,data};
}
const face={boxRaw:[0.1,0.1,0.8,0.8]};
test("분할 마스크 없이도 한정된 양 볼 영역 사진 측정 가능",()=>{
 const result=measureSkinAppearance(sampleImage(),null,face);
 assert.ok(result);
 assert.equal(result.source,"face-patch");
 assert.ok(result.sampleCount>80);
 assert.ok(Number.isFinite(result.variation));
 assert.ok(Number.isFinite(result.texture));
 assert.ok(Number.isFinite(result.brightPatchRatio));
 assert.match(result.note,/전부 피부라는 보장/);
});
test("분할 결과가 있으면 분할 피부 픽셀로 분석",()=>{
 const mask={pixels:new Uint8Array(40*40).fill(3),width:40,height:40};
 const result=measureSkinAppearance(sampleImage(),mask,face);
 assert.ok(result);
 assert.equal(result.source,"segmented");
 assert.ok(result.sampleCount>120);
});
test("얼굴 위치가 불명확하면 개인화 피부결을 임의로 생성하지 않는다",()=>{
 assert.equal(measureSkinAppearance(sampleImage(),null,{boxRaw:[0,0,0,0]}),null);
 const result=analyzeVisibleFactors(sampleImage(),{boxRaw:[0,0,0,0]},null);
 assert.equal(result.skin,null);
});
