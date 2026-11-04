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
  const graphics=[]
  for(const mark of root.querySelectorAll('.fw-view-agents :is(.fw-bar,.fw-seg)')) {
    if(!mark.checkVisibility({opacityProperty:true,visibilityProperty:true}))continue
    const box=mark.getBoundingClientRect(),row=mark.closest('.fw-row'),lane=mark.closest('.fw-lane').getBoundingClientRect()
    if(!box.width||!box.height||box.right<=lane.left||box.left>=lane.right)continue
    const ink=color(getComputedStyle(mark).backgroundColor)
    if(!ink[3])continue
    for(let cursor=mark;cursor&&cursor!==root;cursor=cursor.parentElement)ink[3]*=Number(getComputedStyle(cursor).opacity)
    const bg=over(color(getComputedStyle(row).backgroundColor),color(getComputedStyle(root).backgroundColor))
    const foreground=luminance(over(ink,bg)),background=luminance(bg),ratio=(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)
    graphics.push({agent:row.dataset.spanId,ratio,required:3,className:mark.className})
  }
  return {count:findings.length,min:Math.min(...findings.map(row=>row.ratio)),failures:findings.filter(row=>row.ratio<row.required),graphics:{count:graphics.length,min:Math.min(...graphics.map(row=>row.ratio)),failures:graphics.filter(row=>row.ratio<row.required)}}
}
