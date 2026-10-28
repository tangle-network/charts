/** Browser-side palette distance in CIEDE2000, computed from rendered sRGB pixels. */
export function paletteAudit() {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')
  canvas.width=canvas.height=1
  const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}
  const lab=color=>{
    const [r,g,b]=rgb(color).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4})
    const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116
    const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883)
    return [116*y-16,500*(x-y),200*(y-z)]
  }
  const rad=degrees=>degrees*Math.PI/180,deg=radians=>(radians*180/Math.PI+360)%360
  const delta=(one,two)=>{
    const [l1,a1,b1]=one,[l2,a2,b2]=two,c1=Math.hypot(a1,b1),c2=Math.hypot(a2,b2),c=(c1+c2)/2
    const g=(1-Math.sqrt(c**7/(c**7+25**7)))/2,ap1=(1+g)*a1,ap2=(1+g)*a2,cp1=Math.hypot(ap1,b1),cp2=Math.hypot(ap2,b2)
    const h1=cp1?deg(Math.atan2(b1,ap1)):0,h2=cp2?deg(Math.atan2(b2,ap2)):0
    let dh=h2-h1;if(!cp1||!cp2)dh=0;else if(dh>180)dh-=360;else if(dh< -180)dh+=360
    const dl=l2-l1,dc=cp2-cp1,dH=2*Math.sqrt(cp1*cp2)*Math.sin(rad(dh/2)),lm=(l1+l2)/2,cm=(cp1+cp2)/2
    let hm=h1+h2;if(cp1&&cp2)hm=Math.abs(h1-h2)<=180?hm/2:hm<360?(hm+360)/2:(hm-360)/2
    const t=1-.17*Math.cos(rad(hm-30))+.24*Math.cos(rad(2*hm))+.32*Math.cos(rad(3*hm+6))-.20*Math.cos(rad(4*hm-63))
    const sl=1+.015*(lm-50)**2/Math.sqrt(20+(lm-50)**2),sc=1+.045*cm,sh=1+.015*cm*t
    const rt=-2*Math.sqrt(cm**7/(cm**7+25**7))*Math.sin(rad(60*Math.exp(-(((hm-275)/25)**2))))
    return Math.sqrt((dl/sl)**2+(dc/sc)**2+(dH/sh)**2+rt*(dc/sc)*(dH/sh))
  }
  const root=document.querySelector('[data-flow-waterfall]')
  const resolved=token=>{const el=document.createElement('span');el.style.color=`var(${token})`;root.append(el);const value=lab(getComputedStyle(el).color);el.remove();return value}
  const statuses=['--fw-live','--fw-failed','--fw-ok','--fw-amber'].map(resolved)
  const distances=Array.from({length:5},(_,i)=>({slot:i+1,min:Math.min(...statuses.map(status=>delta(resolved(`--fw-h${i+1}`),status)))}))
  return {distances,min:Math.min(...distances.map(entry=>entry.min))}
}

/** WCAG contrast for visible rendered text, including ancestor alpha and clipping. */
export function contrastAudit() {
  const ctx=document.createElement('canvas').getContext('2d')
  const color=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v)}
  const over=(front,back)=>front.slice(0,3).map((v,i)=>v*front[3]+back[i]*(1-front[3])).concat(1)
  const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
  const root=document.querySelector('[data-flow-waterfall]'),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),findings=[]
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
    const el=node.parentElement,text=node.textContent.trim()
    if(!text||!el.checkVisibility({opacityProperty:true,visibilityProperty:true})||el.closest('.fw-sr-only'))continue
    const range=document.createRange();range.selectNodeContents(node);const box=range.getBoundingClientRect()
    if(!box.width||!box.height)continue
    let clipped=false,opacity=1,bg=[255,255,255,1],chain=[]
    for(let cursor=el;cursor;cursor=cursor.parentElement)chain.unshift(cursor)
    for(const ancestor of chain) {
      const style=getComputedStyle(ancestor),rect=ancestor.getBoundingClientRect()
      opacity*=Number(style.opacity)
      const layer=color(style.backgroundColor);layer[3]*=opacity;bg=over(layer,bg)
      if((/hidden|clip|auto|scroll/.test(style.overflowY)&& (box.bottom<=rect.top||box.top>=rect.bottom))||(/hidden|clip|auto|scroll/.test(style.overflowX)&&(box.right<=rect.left||box.left>=rect.right)))clipped=true
    }
    if(clipped)continue
    const style=getComputedStyle(el),ink=color(style.color);ink[3]*=opacity
    const foreground=luminance(over(ink,bg)),background=luminance(bg),ratio=(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)
    const required=parseFloat(style.fontSize)>=18?3:4.5
    findings.push({text,ratio,required,className:el.className,ink:style.color,background:bg})
  }
  return {count:findings.length,min:Math.min(...findings.map(row=>row.ratio)),failures:findings.filter(row=>row.ratio<row.required)}
}
