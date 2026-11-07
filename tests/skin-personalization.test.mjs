import test from "node:test";
import assert from "node:assert/strict";
import { personalizeSkinKnowledge } from "../skin-personalization.js";

const normalLight={label:"밝기 범위 양호"};
const skin=(variation,texture,brightPatchRatio=0)=>({
  source:"segmented", variation,texture,brightPatchRatio,
  toneLabel:variation>0.24?"빛·색감 차이가 비교적 큰 편":variation<0.11?"빛·색감 차이가 적은 편":"빛·색감 차이가 보통",
  textureLabel:texture>0.04?"미세 무늬가 비교적 뚜렷함":texture<0.011?"미세 무늬가 적게 관찰됨":"미세 무늬가 보통 수준",
});
test("사진 피부결과 명암 변화에 따라 맞춤 카드가 달라진다",()=>{
 const high=personalizeSkinKnowledge({light:normalLight,skin:skin(0.28,0.08)});
 const low=personalizeSkinKnowledge({light:normalLight,skin:skin(0.07,0.008)});
 assert.ok(high.cards.some(x=>x.id==="texture"));
 assert.ok(high.cards.some(x=>x.id==="tone-variation"));
 assert.ok(low.cards.some(x=>x.id==="fine-texture"));
 assert.ok(low.cards.some(x=>x.id==="tone-even"));
 assert.notDeepEqual(high.cards.map(x=>x.id),low.cards.map(x=>x.id));
 assert.equal(high.personalized,true);
});
test("조명이 어둡거나 밝으면 피부결보다 먼저 촬영 환경을 알린다",()=>{
 for(const light of ["어두운 사진","밝은 사진"]){
  const result=personalizeSkinKnowledge({light:{label:light},skin:skin(0.2,0.02)});
  assert.equal(result.cards[0].id,"lighting");
  assert.match(result.summary,light==="어두운 사진"?/그림자/:/빛이 강한/);
 }
});
test("피부 분석이 불가능할 때는 유분·건조 진단 없이 기본 가이드를 제시한다",()=>{
 const result=personalizeSkinKnowledge({light:normalLight,skin:null});
 assert.equal(result.personalized,false);
 assert.equal(result.cards[0].id,"skin-unavailable");
 assert.equal(result.cards.length,4);
 assert.match(result.summary,/피부 영역을 충분히 구분하기 어려워/);
});
test("밝게 반사된 픽셀을 유분 진단이라고 부르지 않는다",()=>{
 const result=personalizeSkinKnowledge({light:normalLight,skin:skin(0.2,0.02,0.2)});
 assert.ok(result.cards.some(x=>x.id==="highlights"));
 assert.match(result.cards.find(x=>x.id==="highlights").body,/피지량을 측정할 수는 없어요/);
});
test("무슨 사진이든 AAD 근거 링크와 민감도 비진단 고지가 들어간다",()=>{
 for(const factors of [
  {light:normalLight,skin:skin(0.28,0.08)},
  {light:normalLight,skin:skin(0.09,0.004)},
  {light:{label:"어두운 사진"},skin:null},
 ]){
  const result=personalizeSkinKnowledge(factors);
  assert.equal(result.cards.length,4);
  assert.ok(result.cards.every(x=>x.sourceUrl.startsWith("https://www.aad.org/")));
  assert.match(result.disclaimer,/수분량·피지량·민감도/);
  assert.ok(result.cards.some(x=>["moisturize","sunscreen","patch-test"].includes(x.id)));
 }
});
test("피부 영역 분할 대신 볼 영역 표본일 때 출처를 명확히 표시한다",()=>{
 const result=personalizeSkinKnowledge({light:normalLight,skin:{...skin(0.18,0.021),source:"face-patch"}});
 assert.equal(result.visualSource,"볼 영역 표본");
 assert.match(result.summary,/볼 영역 표본/);
});
