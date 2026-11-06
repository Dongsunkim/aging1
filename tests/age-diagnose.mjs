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
    results.push({photo:photo.split("/").pop(),...result});
    console.log("AGE_DIAG_RESULT",JSON.stringify(results[results.length-1]));
  }catch(e){console.log("AGE_DIAG_FAILED",photo,String(e));}
}
await browser.close();
if(results.filter(x=>x.success).length<2)process.exitCode=1;
