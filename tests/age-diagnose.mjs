import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const photos = process.argv.slice(2);
const browser = await chromium.launch({ headless:true, args:["--disable-dev-shm-usage","--no-sandbox","--use-gl=swiftshader"] });
const page = await browser.newPage({viewport:{width:1200,height:1000},permissions:[]});
page.on("console",msg=>{
 if(["error","warn"].includes(msg.type())||msg.text().includes("AGE_DUAL_COMPARE"))console.log("browser:",msg.type(),msg.text().slice(0,500));
});
page.on("pageerror",error=>console.log("pageerror:",String(error).slice(0,500)));
if (process.env.AGE_MODEL === "gear") {
  const original = await readFile(new URL("../app.js",import.meta.url),"utf8");
  const configured=original.replace('description: { enabled: true },','description: { enabled: false }, gear: { enabled: true, modelPath: "gear.json", skipFrames: 0, skipTime: 0 },');
  if(configured===original)throw Error("GEAR 설정 적용 실패");
  await page.route("**/app.js",route=>route.fulfill({status:200,contentType:"text/javascript",body:configured}));
  console.log("AGE_DIAG_MODEL",JSON.stringify({model:"GEAR",patchedSource:true}));
}
if (process.env.AGE_MODEL === "dual") {
  const original = await readFile(new URL("../app.js",import.meta.url),"utf8");
  const needle="const result = await model.detect(canvas);";
  const configured=original.replace(needle,`
    const result = await model.detect(canvas, { face: {description:{enabled:true}, ssrnet:{enabled:false}} });
    const secondaryResult=await model.detect(canvas, { face: {description:{enabled:false}, ssrnet:{enabled:true, modelPathAge:"age.json", modelPathGender:"gender-ssrnet-imdb.json", skipFrames:0, skipTime:0}}});
    console.log("AGE_DUAL_COMPARE", JSON.stringify({faceRes:result.face?.[0]?.age, ssrNet:secondaryResult.face?.[0]?.age, faces:secondaryResult.face?.length || 0}));
  `);
  if(configured===original)throw Error("DUAL 설정 적용 실패");
  await page.route("**/app.js",route=>route.fulfill({status:200,contentType:"text/javascript",body:configured}));
  console.log("AGE_DIAG_MODEL",JSON.stringify({model:"DUAL",patchedSource:true}));
}
if (process.env.AGE_MODEL === "deep") {
  const original = await readFile(new URL("../app.js",import.meta.url),"utf8");
  const source = "description: { enabled: true },";
  const configured = original.replace(source,
    'description: { enabled: true, modelPath: "faceres-deep.json", skipFrames: 0, skipTime: 0 },');
  if (configured === original) throw Error("FaceRes Deep 테스트 설정을 적용하지 못했습니다.");
  await page.route("**/app.js",route=>route.fulfill({status:200,contentType:"text/javascript",body:configured}));
  console.log("AGE_DIAG_MODEL",JSON.stringify({model:"FaceRes Deep",patchedSource:true}));
}
if (process.env.AGE_MODEL === "ssrnet") {
  const original = await readFile(new URL("../app.js",import.meta.url),"utf8");
  const source = "description: { enabled: true },";
  const configured = original.replace(source,
    'description: { enabled: false }, ssrnet: { enabled: true, modelPathAge: "age.json", modelPathGender: "gender-ssrnet-imdb.json", skipFrames: 0, skipTime: 0 },');
  if (configured === original) throw Error("SSR 설정을 테스트 앱에 반영하지 못했습니다.");
  await page.route("**/app.js",route=>route.fulfill({status:200,contentType:"text/javascript",body:configured}));
  console.log("AGE_DIAG_MODEL",JSON.stringify({model:"SSR-Net",patchedSource:true}));
}
await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
const results=[];
for(const photo of photos){
  try {
    await page.locator("#fileInput").setInputFiles(photo);
    await page.locator('input[name="userGender"][value="male"]').check();
    await page.waitForFunction(()=>!document.querySelector("#analyzeButton").disabled,{timeout:20000});
    await page.locator("#analyzeButton").click();
    await page.waitForFunction(()=>document.querySelector("#resultSuccess")?.hidden===false||document.querySelector("#resultError")?.hidden===false,{timeout:110000});
    const result=await page.evaluate(()=>({
      success:document.querySelector("#resultSuccess").hidden===false,
      age:document.querySelector("#ageValue").textContent,
      error:document.querySelector("#errorMessage").textContent,
      quality:document.querySelector("#qualityValue").textContent
    }));
    results.push({photo:photo.split("/").pop(),...result});
    console.log("AGE_DIAG_RESULT",JSON.stringify(results[results.length-1]));
  }catch(e){console.log("AGE_DIAG_FAILED",photo,String(e));}
}
await browser.close();
const success=results.filter(x=>x.success);
if (success.length<2 || new Set(success.map(x=>x.age)).size<2) {
  console.error("나이 추정 결과가 정상적으로 다양하지 않습니다.");
  process.exitCode=1;
}

const linda=results.find(x=>x.photo==="person-linda.jpg");
if(linda?.age==="16"){
  console.error("모델 간 예측 차이가 큰 사진에 16세를 확정 표시하는 문제 재발");
  process.exitCode=1;
}
