/**
 * 사진의 얼굴 영역 품질 검사. 실제 얼굴/피부 상태의 신뢰도, 건강상태나 AI
 * 예측의 확률을 반환하지 않습니다.
 * 임계값은 촬영 품질 개선을 위한 보수적인 내부 휴리스틱입니다.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const luminance=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
export function inspectFacePhotoQuality(imageData,face) {
  const width=imageData?.width, height=imageData?.height, data=imageData?.data;
  const box=face?.boxRaw;
  if(!Number.isInteger(width)||!Number.isInteger(height)||!data
     ||data.length!==width*height*4 ||!Array.isArray(box)||box.length<4
     ||!box.slice(0,4).every(Number.isFinite)||box[2]<=0||box[3]<=0){
    return {usable:false,skinUsable:false,ageWarning:"사진 품질을 확인할 수 없습니다.",
      skinLimitReason:"얼굴 영역 품질을 확인하지 못해 피부결을 비교하지 않았어요.",
      flags:["geometry"],sharpness:null,meanLight:null};
  }
  const [bx,by,bw,bh]=box;
  const faceWidth=Math.round(bw*width),faceHeight=Math.round(bh*height);
  const x0=clamp(Math.floor((bx+bw*.16)*width),2,width-3);
  const x1=clamp(Math.ceil((bx+bw*.84)*width),3,width-2);
  const y0=clamp(Math.floor((by+bh*.20)*height),2,height-3);
  const y1=clamp(Math.ceil((by+bh*.82)*height),3,height-2);
  const step=Math.max(2,Math.round(Math.min(faceWidth,faceHeight)/170));
  let count=0,sum=0,shadow=0,clipped=0,edgeEnergy=0,edgeCount=0;
  for(let y=y0+2;y<y1-2;y+=step)for(let x=x0+2;x<x1-2;x+=step){
    const idx=(y*width+x)*4;
    const v=luminance(data,idx);
    sum+=v;
    shadow+=Number(v<=12);
    clipped+=Number(v>=249);
    const a=luminance(data,idx-4),b=luminance(data,idx+4);
    const c=luminance(data,idx-width*4),d=luminance(data,idx+width*4);
    edgeEnergy+=Math.abs(4*v-a-b-c-d);
    edgeCount++;count++;
  }
  if(count<60){
    return {usable:false,skinUsable:false,ageWarning:"얼굴이 너무 작거나 잘려 품질 검사가 어렵습니다.",
      skinLimitReason:"분석할 얼굴 영역이 충분하지 않아요.",flags:["samples"],sharpness:null,meanLight:null};
  }
  const mean=sum/count, veryDark=shadow/count, veryBright=clipped/count;
  const sharpness=edgeEnergy/Math.max(1,edgeCount);
  const faceSmall=faceWidth<170||faceHeight<170;
  // 초점이 크게 벗어난 경우만 감지합니다. 매끈한 피부와 이미지 보정도
  // 저주파 이미지를 만들므로, 이 수치로 피부 건강을 판단하지 않습니다.
  const blurSuspected=sharpness<1.25;
  const clipping=veryBright>=0.14||veryDark>=0.14;
  // 과도한 평균 밝기만으로 유색 피부를 낮은 품질로 분류하지 않습니다.
  const flags=[];
  if(faceSmall)flags.push("small-face");
  if(blurSuspected)flags.push("blur");
  if(veryBright>=0.14)flags.push("overexposure");
  if(veryDark>=0.14)flags.push("underexposure");
  const edgeCut=bx<.012||by<.012||(bx+bw)>.988||(by+bh)>.988;
  if(edgeCut)flags.push("edge-cut");
  const skinUsable=!faceSmall&&!blurSuspected&&!clipping&&!edgeCut;
  const qualityHints=[];
  if(faceSmall)qualityHints.push("얼굴이 작아 세부 피부결이 정확하게 보이지 않을 수 있어요");
  if(blurSuspected)qualityHints.push("초점이 흐릿하거나 보정이 강할 수 있어요");
  if(clipping)qualityHints.push("사진의 일부 밝기 정보가 뭉개져 보여요");
  if(edgeCut)qualityHints.push("얼굴 일부가 화면 가장자리에 붙어 있어요");
  return {
    usable:true,skinUsable,
    ageWarning:flags.length?qualityHints.join(" · "):null,
    skinLimitReason:qualityHints.length?qualityHints.join(" · ")+". 피부결 맞춤 안내를 기본 정보로 바꿨어요.":null,
    flags,faceWidth,faceHeight,
    sharpness:Number(sharpness.toFixed(2)),
    meanLight:Number(mean.toFixed(1)),
    highlightClipping:Number(veryBright.toFixed(3)),
    shadowClipping:Number(veryDark.toFixed(3)),
    // 이 품질 지표는 외모 나이의 신뢰도 %가 아닙니다.
  };
}
