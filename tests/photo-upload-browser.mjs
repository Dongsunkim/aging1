import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

const require=createRequire(import.meta.url);
const {chromium}=require("playwright");
const project=fileURLToPath(new URL("../",import.meta.url));
const root=resolve(project,"apps-in-toss/dist");
const helperRoot=resolve(project,"apps-in-toss/src");
const mime={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  const base=pathname.startsWith("/__picker-test__/")?helperRoot:root;
  const relative=pathname.startsWith("/__picker-test__/")?pathname.slice(17):pathname.slice(1);
  const file=resolve(base,relative||"index.html");
  if(!file.startsWith(base+sep)){res.writeHead(403).end();return;}
  try {const bytes=await readFile(file);res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream"}).end(bytes);}
  catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const executablePath=process.env.AGE_CHROMIUM_PATH||(existsSync("/usr/bin/chromium")?"/usr/bin/chromium":undefined);
const browser=await chromium.launch({executablePath,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
let requestsWithBody=0;
const context=await browser.newContext({viewport:{width:390,height:844}});
context.on("request",request=>{if(["POST","PUT","PATCH"].includes(request.method()))requestsWithBody++;});
const errors=[];
context.on("page",page=>page.on("pageerror",error=>errors.push(error.message)));

async function nativePage(mode="success"){
  const page=await context.newPage();
  await page.addInitScript(({mode})=>{
    window.__photoTest={mode,photoCalls:0,recoveryCalls:0};
    let picker;
    const ready=async()=>{
      if(picker)return picker;
      const {createTossPhotoPicker}=await import("/__picker-test__/toss-photo-picker.mjs");
      const getPhotos=async()=>{
        window.__photoTest.photoCalls++;
        if(window.__photoTest.mode==="denied")throw Object.assign(new Error("permission denied"),{code:"PERMISSION_DENIED"});
        if(window.__photoTest.mode==="cancel")return [];
        if(window.__photoTest.mode==="invalid")return [{dataUri:"!!!"}];
        const canvas=document.createElement("canvas");canvas.width=canvas.height=128;
        const ctx=canvas.getContext("2d");ctx.fillStyle="#835bdc";ctx.fillRect(0,0,128,128);
        return [{dataUri:canvas.toDataURL("image/png")}];
      };
      getPhotos.openPermissionDialog=async()=>{window.__photoTest.recoveryCalls++;window.__photoTest.mode="success";return "allowed";};
      picker=createTossPhotoPicker(getPhotos);return picker;
    };
    window.__TOSS_OPEN_ALBUM__=async callback=>(await ready()).open(callback);
    window.__TOSS_REQUEST_ALBUM_PERMISSION__=async callback=>(await ready()).requestPermission(callback);
  },{mode});
  await page.goto(origin,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>document.querySelector("#dropZone")?.getAttribute("role")==="button");
  return page;
}
try{
  const page=await nativePage();
  await page.locator("#dropZone").click();
  await page.locator("#imageState").waitFor({state:"visible"});
  assert.equal(await page.locator("#previewImage").evaluate(img=>img.naturalWidth),128);
  await page.locator('input[name="userGender"][value="male"]').check();
  await page.locator("#tossAnalyzeRoot button:not([disabled])").waitFor();
  assert.deepEqual(await page.evaluate(()=>[window.__photoTest.photoCalls,window.__photoTest.recoveryCalls]),[1,0]);
  await page.evaluate(()=>{window.__photoTest.mode="cancel";});
  await page.locator("#resetButton").click();
  await page.waitForFunction(()=>!document.querySelector("#dropZone").hasAttribute("aria-busy"));
  assert.equal(await page.locator("#imageState").isVisible(),true);
  console.log("PASS native photo → validation → decoded preview → enabled analysis; cancel preserves previous photo");

  const denied=await nativePage("denied");
  await denied.locator("#dropZone").click();
  await denied.locator("#photoPermissionButton").waitFor({state:"visible"});
  assert.equal(await denied.evaluate(()=>window.__photoTest.recoveryCalls),0);
  await denied.locator("#photoPermissionButton").click();
  await denied.locator("#imageState").waitFor({state:"visible"});
  assert.equal(await denied.evaluate(()=>window.__photoTest.recoveryCalls),1);
  console.log("PASS permission rejection → explicit recovery → photo preview");

  const invalid=await nativePage("invalid");
  await invalid.locator("#dropZone").click();
  await invalid.locator("#photoPickerNotice.is-error").waitFor({state:"visible"});
  assert.match(await invalid.locator("#photoPickerNotice").textContent(),/크기 또는 형식/);
  assert.equal(await invalid.locator("#imageState").isVisible(),false);
  assert.equal(await invalid.locator("#analyzeButton").isDisabled(),true);
  console.log("PASS malformed photo rejected with the real conversion error");

  const web=await context.newPage();
  await web.goto(origin,{waitUntil:"networkidle"});
  assert.equal(await web.evaluate(()=>typeof window.__TOSS_OPEN_ALBUM__),"undefined");
  const raw=await web.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=canvas.height=128;canvas.getContext("2d").fillRect(0,0,128,128);return canvas.toDataURL("image/png").split(",")[1];});
  const chooserPromise=web.waitForEvent("filechooser");
  await web.locator("#dropZone").click();
  await (await chooserPromise).setFiles({name:"test-photo.png",mimeType:"image/png",buffer:Buffer.from(raw,"base64")});
  await web.locator("#imageState").waitFor({state:"visible"});
  console.log("PASS ordinary browser uses its native HTML file picker");
  assert.equal(requestsWithBody,0,"photo selection must not send files to a server");
  assert.deepEqual(errors,[]);
  console.log("PASS no page errors and no upload requests; native photo API is mocked, real device permission UI still needs testing");
}catch(error){console.error("Browser evidence:", JSON.stringify(errors));throw error;}
finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
