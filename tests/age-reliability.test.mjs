import test from "node:test";
import assert from "node:assert/strict";
import { assessRepeatedAge, compareAgeModels } from "../age-reliability.js";

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
