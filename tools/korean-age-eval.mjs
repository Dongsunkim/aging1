/**
 * 한국인 연령 라벨 데이터로 얼굴 나이 추정 모델을 평가하는 오프라인 도구.
 *
 * IMPORTANT
 * - 데이터셋의 원본 사진/신원 정보는 저장소에 추가하지 않습니다.
 * - 입력한 데이터가 실제 한국인인지/사용 승인을 받았는지는 프로그램이 인증하지 않습니다.
 * - 출력은 집계치만 제공하며 성별/국적 추정 모델을 만들지 않습니다.
 *
 * CSV columns:
 * dataset_id,approved_use,subject_key,image_key,age_at_capture,faceres_age,ssrnet_age,gear_age
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const DATASET_ID = "AIHUB-71415";
export const BUCKETS = [
  {key:"0-19",min:0,max:19},
  {key:"20-34",min:20,max:34},
  {key:"35-49",min:35,max:49},
  {key:"50+",min:50,max:120},
];
const REQUIRED = ["dataset_id","approved_use","subject_key","image_key","age_at_capture","faceres_age","ssrnet_age","gear_age"];

export function parseCSV(source) {
  if (typeof source !== "string") throw new Error("CSV 텍스트가 필요합니다.");
  const rows = [];
  let row = [], cell = "", quote = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i=0; i<text.length; i++) {
    const ch=text[i];
    if (ch==='"') {
      if (quote && text[i+1]==='"') {cell+='"';i++;}
      else if (!quote && cell!=="") throw new Error("CSV 따옴표 형식이 올바르지 않습니다.");
      else quote=!quote;
    } else if (!quote && (ch==="," || ch==="\n" || ch==="\r")) {
      if (ch===",") { row.push(cell); cell=""; }
      else {
        row.push(cell); cell="";
        if (row.some(value=>value.trim()!=="")) rows.push(row);
        row=[];
        if (ch==="\r" && text[i+1]==="\n") i++;
      }
    } else cell+=ch;
  }
  if (quote) throw new Error("닫히지 않은 CSV 따옴표가 있습니다.");
  if (cell!=="" || row.length>0) {
    row.push(cell);
    if(row.some(value=>value.trim()!==""))rows.push(row);
  }
  if(rows.length<2)throw new Error("CSV 헤더와 평가 행이 필요합니다.");
  const headers=rows.shift().map(x=>x.trim());
  if(new Set(headers).size!==headers.length)throw new Error("중복된 CSV 열 이름이 있습니다.");
  for(const col of REQUIRED)if(!headers.includes(col))throw new Error("필수 열이 없습니다: "+col);
  return rows.map((values,idx)=>{
    if(values.length!==headers.length)throw new Error("CSV "+(idx+2)+"행의 열 개수가 다릅니다.");
    return Object.fromEntries(headers.map((key,i)=>[key,values[i].trim()]));
  });
}

function numberAge(value,label,rowNumber) {
  const x=Number(value);
  if(!Number.isFinite(x)||value===""||x<0||x>120)throw new Error(`${rowNumber}행의 ${label} 값은 0~120 사이 숫자여야 합니다.`);
  return x;
}
function round(num){return Math.round(num*100)/100;}
function percentile(sorted,q) {
  if(!sorted.length)return null;
  const pos=(sorted.length-1)*q;
  const low=Math.floor(pos),high=Math.ceil(pos);
  return sorted[low]+(sorted[high]-sorted[low])*(pos-low);
}
function metrics(rows,key) {
  if(!rows.length)return null;
  const absolute=rows.map(r=>Math.abs(r[key]-r.age)).sort((a,b)=>a-b);
  const errors=rows.map(r=>r[key]-r.age);
  return {
    count:rows.length,
    mae:round(absolute.reduce((a,b)=>a+b,0)/absolute.length),
    medianAbsoluteError:round(percentile(absolute,0.5)),
    p90AbsoluteError:round(percentile(absolute,0.9)),
    bias:round(errors.reduce((a,b)=>a+b,0)/errors.length),
    within5Percent:round(100*absolute.filter(x=>x<=5).length/absolute.length),
    older30Predicted17OrLess:rows.filter(r=>r.age>=30 && r[key]<=17).length,
  };
}

export function evaluateKoreanCohort(sourceRows) {
  if(!Array.isArray(sourceRows)||!sourceRows.length)throw new Error("평가 데이터가 없습니다.");
  const subjectKeys=new Set(),imageKeys=new Set();
  const rows=sourceRows.map((row,i)=>{
    const n=i+2;
    if(row.dataset_id!==DATASET_ID)throw new Error(`${n}행의 데이터셋 표기가 ${DATASET_ID}가 아닙니다.`);
    if(row.approved_use!=="yes")throw new Error(`${n}행은 사용 승인 확인이 표시되지 않았습니다.`);
    const subject=String(row.subject_key||"").trim(),image=String(row.image_key||"").trim();
    if(!subject || !image || subject.length>120 || image.length>120)throw new Error("가명화된 참가자 및 사진 식별자가 필요합니다.");
    if(imageKeys.has(image))throw new Error("사진 식별자가 중복됐습니다.");
    subjectKeys.add(subject);imageKeys.add(image);
    return {
      age:numberAge(row.age_at_capture,"촬영 당시 나이",n),
      faceres:numberAge(row.faceres_age,"FaceRes 추정 나이",n),
      ssrnet:numberAge(row.ssrnet_age,"SSR-Net 추정 나이",n),
      gear:numberAge(row.gear_age,"GEAR 추정 나이",n),
      // 실제 서비스(8.4)와 동일한 세 모델의 중앙값을 비교합니다.
      ensemble:[Number(row.faceres_age),Number(row.ssrnet_age),Number(row.gear_age)]
        .sort((a,b)=>a-b)[1],
    };
  });

  const models=["faceres","ssrnet","gear","ensemble"];
  const groups=Object.fromEntries(BUCKETS.map(bucket=>{
    const selected=rows.filter(r=>r.age>=bucket.min && r.age<=bucket.max);
    return [bucket.key,{
      count:selected.length,
      ...Object.fromEntries(models.map(model=>[
        model,selected.length>=20?metrics(selected,model):null,
      ])),
    }];
  }));
  const modelResults=Object.fromEntries(models.map(model=>[model,metrics(rows,model)]));
  const counts=Object.values(groups).map(x=>x.count);
  const adequate=rows.length>=400 && subjectKeys.size>=100 && counts.every(x=>x>=20);
  const baseline=modelResults.ensemble; // 현재 서비스(세 모델 중앙값)를 기준으로 검증합니다.
  const candidateModels=models.filter(model=>model!=="ensemble").sort((a,b)=>modelResults[a].mae-modelResults[b].mae);
  const reviewable=candidateModels.filter(model=>{
    const candidate=modelResults[model];
    // 작은 점수 차이나 특정 연령대 악화를 이유로 자동 교체하지 않습니다.
    const improvement=baseline.mae-candidate.mae>=0.5;
    const groupSafe=adequate && Object.values(groups).every(group=>
      group[model].mae<=group.ensemble.mae+1
      && group[model].older30Predicted17OrLess<=group.ensemble.older30Predicted17OrLess+1);
    const noNewSevereErrors=candidate.older30Predicted17OrLess<=baseline.older30Predicted17OrLess;
    return adequate && improvement && groupSafe && noNewSevereErrors;
  });
  return {
    dataset:DATASET_ID,
    benchmarkStatus:adequate?"집계 완료":"표본 부족 · 모델 변경 판단 불가",
    description:"촬영 당시 나이와 사진 기반 추정 나이의 비교이며, 국적을 사진에서 분류하지 않습니다.",
    totalImages:rows.length,
    uniqueSubjects:subjectKeys.size,
    modelResults,
    ageGroups:groups,
    currentMethod:"ensemble",
    proposedModel:reviewable[0]||"retain-ensemble",
    eligibleForReview:reviewable.length>0,
    // 결과만으로 새 모델의 실제 배포 성능이 개선된다고 확정하지 않습니다.
    deploymentAutomatic:false,
    minimumCohort:{images:400,subjects:100,perAgeBand:20},
    notes:[
      "CSV 내 approved_use 값만 확인하므로 법적 사용 승인 사실을 검증한 것은 아닙니다.",
      "검증용 평가 자료가 학습 데이터와 동일 인물을 공유하면 성능이 과대평가됩니다.",
      "평가에 사용한 가명 식별자도 외부 서비스에 공유하지 마세요.",
      "원본 이미지·파일명·참가자 식별자는 보고서에 포함되지 않습니다.",
      "코드 검토와 별도의 토스 실기기 검증 없이 앱 모델을 자동 교체하지 않습니다.",
    ],
  };
}

async function main() {
  const args=process.argv.slice(2);
  const csvIndex=args.indexOf("--csv"),outIndex=args.indexOf("--output");
  if(csvIndex<0||!args[csvIndex+1])throw new Error("사용법: node tools/korean-age-eval.mjs --csv 승인된-평가값.csv [--output 집계.json]");
  const rows=parseCSV(await readFile(args[csvIndex+1],"utf8"));
  const report=evaluateKoreanCohort(rows);
  const data=JSON.stringify(report,null,2)+"\n";
  if(outIndex>=0&&args[outIndex+1])await writeFile(args[outIndex+1],data);
  else process.stdout.write(data);
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(err=>{console.error("한국인 얼굴 나이 평가 오류:",err.message);process.exitCode=1;});
}
