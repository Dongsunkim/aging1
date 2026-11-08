import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, evaluateKoreanCohort, DATASET_ID } from "../tools/korean-age-eval.mjs";

function makeRows({count=400,baseOffset=8,secondOffset=2,thirdOffset=1}={}){
  const ages=[16,27,42,59];
  return Array.from({length:count},(_,i)=>{
    const age=ages[i%4];
    return {
      dataset_id:DATASET_ID,approved_use:"yes",
      subject_key:`private-person-${Math.floor(i/4)}`,
      image_key:`private-photo-${i}`,
      age_at_capture:String(age),
      faceres_age:String(age+baseOffset),
      ssrnet_age:String(age+secondOffset),
      gear_age:String(age+thirdOffset),
    };
  });
}
test("승인된 데이터의 CSV 형식과 쉼표 인용을 해석한다",()=>{
  const csv='dataset_id,approved_use,subject_key,image_key,age_at_capture,faceres_age,ssrnet_age,gear_age\nAIHUB-71415,yes,"p,1",photo,39,26.2,33.1,35.3\n';
  const rows=parseCSV(csv);
  assert.equal(rows.length,1);
  assert.equal(rows[0].subject_key,"p,1");
});
test("승인 확인 및 데이터 출처가 없으면 중단한다",()=>{
  const [row]=makeRows({count:1});
  assert.throws(()=>evaluateKoreanCohort([{...row,approved_use:"no"}]),/승인/);
  assert.throws(()=>evaluateKoreanCohort([{...row,dataset_id:"not-a-korean-dataset"}]),/데이터셋/);
});
test("적은 사진만으로 한국인 모델 교체를 추천하지 않는다",()=>{
  const result=evaluateKoreanCohort(makeRows({count:8}));
  assert.equal(result.eligibleForReview,false);
  assert.equal(result.proposedModel,"retain-ensemble");
  assert.equal(result.benchmarkStatus,"표본 부족 · 모델 변경 판단 불가");
});
test("연령대별 평가 기준과 모델 개선 조건을 통과한 집계만 후보가 된다",()=>{
  const result=evaluateKoreanCohort(makeRows());
  assert.equal(result.totalImages,400);
  assert.equal(result.uniqueSubjects,100);
  assert.equal(result.benchmarkStatus,"집계 완료");
  assert.equal(result.modelResults.faceres.mae,8);
  assert.equal(result.modelResults.ssrnet.mae,2);
  assert.equal(result.modelResults.gear.mae,1);
  assert.equal(result.modelResults.ensemble.mae,2);
  assert.equal(result.currentMethod,"ensemble");
  assert.equal(result.proposedModel,"gear");
  assert.equal(result.eligibleForReview,true);
  assert.equal(result.deploymentAutomatic,false);
  for(const info of Object.values(result.ageGroups))assert.equal(info.count,100);
});
test("심한 연령대 편향이 있으면 모델 전환을 금지한다",()=>{
  const rows=makeRows();
  for(const row of rows){
    if(Number(row.age_at_capture)>=50){row.ssrnet_age=String(Number(row.age_at_capture)+20);row.gear_age=String(Number(row.age_at_capture)+20);}
  }
  const result=evaluateKoreanCohort(rows);
  assert.equal(result.eligibleForReview,false);
});
test("결과 보고서에는 개인·사진 식별자를 싣지 않는다",()=>{
  const result=evaluateKoreanCohort(makeRows());
  const text=JSON.stringify(result);
  assert.ok(!text.includes("private-person-"));
  assert.ok(!text.includes("private-photo-"));
});
test("중복 사진, 무효 값은 계산하지 않는다",()=>{
  const rows=makeRows({count:2});
  rows[1].image_key=rows[0].image_key;
  assert.throws(()=>evaluateKoreanCohort(rows),/중복/);
  const [row]=makeRows({count:1});
  row.age_at_capture="not-age";
  assert.throws(()=>evaluateKoreanCohort([row]),/숫자/);
});

test("세 모델의 중앙값을 실제 서비스 방식으로 검증",()=>{
 const rows=makeRows({count:400,baseOffset:16,secondOffset:7,thirdOffset:2});
 const result=evaluateKoreanCohort(rows);
 assert.equal(result.modelResults.faceres.mae,16);
 assert.equal(result.modelResults.ssrnet.mae,7);
 assert.equal(result.modelResults.gear.mae,2);
 assert.equal(result.modelResults.ensemble.mae,7);
 assert.equal(result.proposedModel,"gear");
});
test("세 번째 모델 예측이 빠졌거나 비정상이면 평가 중단",()=>{
 const rows=makeRows({count:2});
 delete rows[0].gear_age;
 assert.throws(()=>evaluateKoreanCohort(rows),/GEAR/);
});
test("승인 표기만으로 법적 권한 검증을 완료했다고 단정하지 않는다",()=>{
 const report=evaluateKoreanCohort(makeRows({count:8}));
 assert.match(report.notes.join(" "),/법적 사용 승인 사실을 검증한 것은 아닙니다/);
});
