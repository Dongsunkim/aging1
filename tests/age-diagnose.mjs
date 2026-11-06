import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const photos = process.argv.slice(2);
const browser = await chromium.launch({ headless:true, args:["--disable-dev-shm-usage","--no-sandbox","--use-gl=swiftshader"] });
const page = await browser.newPage({viewport:{width:1200,height:1000},permissions:[]});
page.on("console",msg=>{
 if(["error","warn"].includes(msg.type()))console.log("browser:",msg.type(),msg.text().slice(0,380));
});
page.on("pageerror",error=>console.log("pageerror:",String(error).slice(0,500)));
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
    // 독립적인 SSR-Net 모델로 동일 사진의 나이 추정을 별도 확인합니다.
    const alternative = await Promise.race([page.evaluate(async () => {
      try {
        if (!window.__secondaryAgeModel) {
          window.__secondaryAgeModel = new window.Human.Human({
            backend: "webgl", debug:false, warmup:"none",
            modelBasePath:"https://vladmandic.github.io/human-models/models/",
            cacheSensitivity:0, cacheModels:false, async:false,
            face:{
              enabled:true, detector:{maxDetected:3,minConfidence:0.3},
              mesh:{enabled:true},iris:{enabled:false},description:{enabled:false},
              emotion:{enabled:false},ssrnet:{enabled:true,modelPathAge:"age.json",modelPathGender:"gender-ssrnet-imdb.json",skipFrames:0,skipTime:0}
            },
            body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},segmentation:{enabled:false},
          });
          await window.__secondaryAgeModel.load();
        }
        const result = await window.__secondaryAgeModel.detect(document.querySelector("#previewImage"));
        return {age:result.face?.[0]?.age || null,faceCount:result.face?.length||0};
      }catch(e){return {error:String(e).slice(0,240)};}
    }), new Promise(resolve=>setTimeout(()=>resolve({error:"보조 모델 분석 제한 시간 초과"}),20000))]);
    results.push({photo:photo.split("/").pop(),...result,alternative});
    console.log("AGE_DIAG_RESULT",JSON.stringify(results[results.length-1]));
  }catch(e){console.log("AGE_DIAG_FAILED",photo,String(e));}
}
await browser.close();
if(results.filter(x=>x.success).length<2)process.exitCode=1;
