import test from "node:test";
import assert from "node:assert/strict";
import { inspectFacePhotoQuality } from "../photo-quality.js";
import { analyzeVisibleFactors } from "../visual-analysis.js";
import { personalizeSkinKnowledge } from "../skin-personalization.js";

const face = {boxRaw:[0.12,0.10,0.76,0.8]};
const sample=(kind="pattern")=>{
  const width=480,height=480,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    const v=kind==="white"?255:kind==="black"?0:kind==="uniform"?125:
      100+(x%7<3?40:0)+(y%5<2?15:0);
    data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;
  }
  return {width,height,data};
};
test("정면 모의사진에서 초점·밝기 검사 수치를 반환",()=>{
 const quality=inspectFacePhotoQuality(sample("pattern"),face);
 assert.equal(quality.usable,true);
 assert.equal(quality.skinUsable,true);
 assert.equal(quality.flags.length,0);
 assert.ok(quality.sharpness>1.25);
});
test("심하게 흐린/과다 노출/암부 클리핑 사진은 피부결 맞춤 정보를 보류",()=>{
 for(const kind of ["uniform","white","black"]){
  const quality=inspectFacePhotoQuality(sample(kind),face);
  assert.equal(quality.skinUsable,false);
  assert.ok(quality.flags.length>0);
  const factors=analyzeVisibleFactors(sample(kind),face,{width:48,height:48,pixels:new Uint8Array(48*48).fill(3)});
  assert.equal(factors.skin,null);
  const guide=personalizeSkinKnowledge(factors);
  assert.equal(guide.personalized,false);
  assert.equal(guide.cards.length,4);
  assert.equal(guide.cards[0].id,"lighting");
 }
});
test("얼굴이 너무 작거나 잘리면 임의 피부 측정을 하지 않는다",()=>{
 const image=sample("pattern"),mask={width:48,height:48,pixels:new Uint8Array(48*48).fill(3)};
 const tiny={boxRaw:[0.4,0.4,0.12,0.14]};
 const tinyResult=analyzeVisibleFactors(image,tiny,mask);
 assert.equal(tinyResult.photoQuality.skinUsable,false);
 assert.equal(tinyResult.skin,null);
 const cropped={boxRaw:[0,0,0.76,0.85]};
 const croppedResult=analyzeVisibleFactors(image,cropped,mask);
 assert.equal(croppedResult.photoQuality.skinUsable,false);
});
test("개별 사진의 밝기와 품질 차이가 맞춤 가이드를 바꾸지만 나이를 고치지는 않는다",()=>{
 const image=sample("pattern"),mask={width:48,height:48,pixels:new Uint8Array(48*48).fill(3)};
 const good=analyzeVisibleFactors(image,face,mask);
 assert.ok(good.skin && Number.isFinite(good.skin.texture));
 assert.equal(good.skin.toneReliable,true);
 assert.ok(good.skin.sampleCount>=120);
 assert.equal(good.photoQuality.skinUsable,true);
 assert.equal(personalizeSkinKnowledge(good).personalized,true);
});
test("사진의 얼굴 영역이 없거나 잘못되면 품질 판단도 안전하게 종료한다",()=>{
 const result=inspectFacePhotoQuality(sample(),{boxRaw:[0,0,0,0]});
 assert.equal(result.usable,false);
 assert.equal(result.skinUsable,false);
});
