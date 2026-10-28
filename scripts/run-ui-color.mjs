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
  const light=getComputedStyle(root).colorScheme==='light'
  const search=(from,to,chroma=.11)=>{
    const candidates=[]
    for(let h=from;h<=to;h+=.1)for(const l of light?[.52,.55,.58]:[.67,.70,.73]) {
      const min=Math.min(...statuses.map(status=>delta(lab(`oklch(${l} ${chroma} ${h})`),status)))
      candidates.push({h,l,min})
    }
    return candidates.sort((a,b)=>b.min-a.min).slice(0,3)
  }
  return {distances,min:Math.min(...distances.map(entry=>entry.min)),blue:search(250,295),cyan:search(180,225),pink:search(330,350),slate:search(200,290,.03),colors:Array.from({length:5},(_,i)=>{const el=document.createElement('i');el.style.color=`var(--fw-h${i+1})`;root.append(el);const color=getComputedStyle(el).color;el.remove();return color})}
}
