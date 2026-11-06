import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const photos = process.argv.slice(2);
const browser = await chromium.launch({ headless:true, args:["--disable-dev-shm-usage","--no-sandbox","--use-gl=swiftshader"] });
const page = await browser.newPage({viewport:{width:1200,height:1000},permissions:[]});
page.on("console",msg=>{
 if(["error","warn"].includes(msg.type()))console.log("browser:",msg.type(),msg.text().slice(0,380));
});
page.on("pageerror",error=>console.log("pageerror:",String(error).slice(0,500)));
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
