import test from "node:test";
import assert from "node:assert/strict";
import { assessRepeatedAge, compareAgeModels, combineAgeEstimates } from "../age-reliability.js";

test("서로 다른 사진에서 세 번 거의 동일한 원시 나이값이면 경고", () => {
  let history = [];
  for (const [fingerprint, age] of [["first",16.0],["second",16.1],["third",16.2]]) {
    const result = assessRepeatedAge(history, fingerprint, age);
    history = result.history;
    assert.equal(result.repeated, fingerprint === "third");
  }
});
test("같은 사진 재분석은 반복 오작동 경고에서 제외", () => {
  let history = [];
  for (let i=0;i<8;i++){
    const result=assessRepeatedAge(history,"same-image",16);
    history=result.history;
    assert.equal(result.repeated,false);
    assert.equal(history.length,1);
  }
});
test("여러 사진의 나이값이 충분히 다르면 정상", () => {
  let history=[];
  for(const [fingerprint,age] of [["first",16],["second",31],["third",48]]){
    const result=assessRepeatedAge(history,fingerprint,age);
    history=result.history;
    assert.equal(result.valid,true);
    assert.equal(result.repeated,false);
  }
});
test("무효 나이값을 확정 결과로 받아들이지 않음", () => {
  assert.equal(assessRepeatedAge([],"test",Number.NaN).valid,false);
  assert.equal(assessRepeatedAge([],"test",0).valid,false);
});
test("독립 모델의 나이 차이 판정", () => {
  assert.equal(compareAgeModels(16,35).disagreement,true);
  assert.equal(compareAgeModels(31,36).disagreement,false);
  assert.equal(compareAgeModels(31,undefined).available,false);
});

test("세 모델의 중앙값을 택해 16세 단독 이상치를 완화한다",()=>{
 const result=combineAgeEstimates({faceres:16.2,ssrnet:29.3,gear:21.1});
 assert.equal(result.age,21);
 assert.equal(result.method,"세 모델 중앙값");
 assert.equal(result.count,3);
 assert.equal(result.disagreement,true);
});
test("세 모델 결과가 있을 때 원시 나이 분포에 관계없이 숫자를 반환한다",()=>{
 for (const ages of [
  {faceres:38.6,ssrnet:29.1,gear:25},
  {faceres:23.6,ssrnet:29.5,gear:23},
  {faceres:16,ssrnet:16,gear:16}
 ]){
  assert.ok(Number.isInteger(combineAgeEstimates(ages).age));
 }
});
test("일부 모델이 응답하지 않더라도 나이 숫자를 반환한다",()=>{
 assert.equal(combineAgeEstimates({faceres:16.2,ssrnet:29.3,gear:null}).age,23);
 assert.equal(combineAgeEstimates({faceres:34,ssrnet:null,gear:null}).age,34);
 assert.equal(combineAgeEstimates({faceres:34,ssrnet:null,gear:null}).method,"단일 모델 예측");
});
test("모든 모델이 실패하면 추정 나이를 지어내지 않는다",()=>{
 assert.throws(()=>combineAgeEstimates({faceres:null,ssrnet:NaN,gear:undefined}),/유효한/);
});
