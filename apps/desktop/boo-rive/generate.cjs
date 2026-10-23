/* Gera o arquivo-fonte Rive a partir das silhuetas atuais. Sem dependências externas. */
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/src/features/app/boo-appearance.ts'), 'utf8')
const shapes = [...source.matchAll(/^\s*(?:'([^']+)'|([a-z][\w-]*)):\s*'([^']+)'/gm)]
  .map(([,quoted,key,value]) => ({ key: quoted || key, value }))
  .filter(({key}) => ['round','flat','long','drop','squircle','bean','ghost-wave','ghost-puff','cute-squid','soft-square','little-cat','ghost-peak'].includes(key))
if (shapes.length !== 12) throw new Error('Não foi possível recuperar as 12 silhuetas originais')
const fmt = n => Number(n.toFixed(3))
function vertexXml(d) {
  const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g)
  let i=0, cmd='', prev={x:0,y:0}, first=null, verts=[]
  const get=()=>Number(tok[i++])
  const make=(x,y)=>({x,y,inc:null,out:null})
  const ctrl=(a,b)=>({x:a.x+2*(b.x-a.x)/3,y:a.y+2*(b.y-a.y)/3})
  const seg=(end,c1,c2)=>{
    const current=verts[verts.length-1]
    current.out={x:c1.x-current.x,y:c1.y-current.y}
    const close = first && Math.abs(end.x-first.x)<.001 && Math.abs(end.y-first.y)<.001
    const next=close?first:make(end.x,end.y)
    next.inc={x:c2.x-end.x,y:c2.y-end.y}
    if(!close) verts.push(next)
    prev=end
  }
  while(i<tok.length){
    if(/[A-Za-z]/.test(tok[i]))cmd=tok[i++]
    if(cmd==='M'){ const x=get(),y=get(); prev={x,y};first=make(x,y);verts=[first];cmd='L' }
    else if(cmd==='L'){const end={x:get(),y:get()};seg(end,{x:prev.x+(end.x-prev.x)/3,y:prev.y+(end.y-prev.y)/3},{x:prev.x+2*(end.x-prev.x)/3,y:prev.y+2*(end.y-prev.y)/3})}
    else if(cmd==='H'){const end={x:get(),y:prev.y};seg(end,{x:prev.x+(end.x-prev.x)/3,y:prev.y},{x:prev.x+2*(end.x-prev.x)/3,y:prev.y})}
    else if(cmd==='V'){const end={x:prev.x,y:get()};seg(end,{x:prev.x,y:prev.y+(end.y-prev.y)/3},{x:prev.x,y:prev.y+2*(end.y-prev.y)/3})}
    else if(cmd==='Q'){const q={x:get(),y:get()},end={x:get(),y:get()};seg(end,ctrl(prev,q),ctrl(end,q))}
    else if(cmd==='C'){const c1={x:get(),y:get()},c2={x:get(),y:get()},end={x:get(),y:get()};seg(end,c1,c2)}
    else if(cmd==='Z'){i=tok.length;break}
    else throw new Error('SVG command unsupported: '+cmd)
  }
  const area=verts.reduce((sum,v,j)=>sum+v.x*verts[(j+1)%verts.length].y-verts[(j+1)%verts.length].x*v.y,0)
  const lines=verts.map(v=>{
    const hand=(h,p)=> h ? ` ${p}Rotation="${fmt(Math.atan2(h.y,h.x))}" ${p}Distance="${fmt(Math.hypot(h.x,h.y))}"` : ` ${p}Rotation="0" ${p}Distance="0"`
    return `<CubicDetachedVertex x="${fmt(v.x)}" y="${fmt(v.y)}"${hand(v.inc,'in')}${hand(v.out,'out')}/>`
  })
  return `<PointsPath isClosed="true" isClockwise="${area>0}" name="Silhouette">\n${lines.join('\n')}\n</PointsPath>`
}
const property = {light:'0:302',base:'0:303',dark:'0:304',eyes:'0:305',cheek:'0:306',smileOpacity:'0:307',talkOpacity:'0:308',blushOpacity:'0:309',gazeX:'0:310',gazeY:'0:311',ambientCenter:'0:312',ambientMid:'0:313',ambientEdge:'0:314'}
const bind=(prop,key)=>`<DataBindContext sourcePathIds="0:300-${property[prop]}" propertyKey="${key}"/>`
const solid=(value,prop)=>`<SolidColor colorValue="${value}" name="Color">${prop?bind(prop,37):''}</SolidColor>`
const fill=(value,prop)=>`<Fill name="Fill">${solid(value,prop)}</Fill>`
const ellipse=(name,x,y,w,h,value,prop,opacityBind)=>`<Shape x="${x}" y="${y}" name="${name}" ${opacityBind?`opacity="0.45"`:''}>
<Ellipse width="${w}" height="${h}" originX="0.5" originY="0.5"/>
${opacityBind?bind(opacityBind,18):''}
${fill(value,prop)}</Shape>`
function board(key,i,d){
  const idx=i===0?'0':String(i)
  // Os IDs locais dos artboards usam o próprio índice, mantendo o ViewModel global.
  const id=(num)=>`${idx}:${num}`
  const smile=`<Shape name="Smile" opacity="1"><PointsPath isClosed="false"><StraightVertex x="108" y="124"/><CubicDetachedVertex x="120" y="132" inRotation="3.14" inDistance="6" outRotation="0" outDistance="6"/><StraightVertex x="132" y="124"/></PointsPath><Stroke thickness="5" cap="round" join="round">${solid('FFFFFFFF')}</Stroke>${bind('smileOpacity',18)}</Shape>`
  const talk=ellipse('Speaking mouth',120,130,12,10,'FFFFFFFF',null,'talkOpacity')
  const body=`<Shape name="Original ${key}">
${vertexXml(d)}
<Fill name="Gradient"><RadialGradient startX="82" startY="40" endX="195" endY="166" name="Color">
<GradientStop position="0" colorValue="FFBCB5FF">${bind('light',38)}</GradientStop>
<GradientStop position=".52" colorValue="FF786BEA">${bind('base',38)}</GradientStop>
<GradientStop position="1" colorValue="FF4A4190">${bind('dark',38)}</GradientStop>
</RadialGradient></Fill></Shape>`
  const eyes=`<Node name="Blinking eyes" id="${id(40)}" x="120" y="94">
${bind('gazeX',13)}${bind('gazeY',14)}
${ellipse('Left eye',-26,0,16,24,'FFFFFFFF','eyes')}
${ellipse('Right eye',26,0,16,24,'FFFFFFFF','eyes')}
</Node>`
  const glow=`<Shape x="91" y="43" rotation="-0.418879" name="Original head highlight">
<Ellipse width="74" height="26" originX=".5" originY=".5"/>
${fill('38FFFFFF')}</Shape>`
  const ambient=`<Shape x="120" y="100" name="Soft surrounding glow">
<Ellipse width="200" height="200" originX=".5" originY=".5"/>
<Fill name="Fade"><RadialGradient startX="0" startY="0" endX="100" endY="0">
<GradientStop position="0" colorValue="3D786BEA">${bind('ambientCenter',38)}</GradientStop>
<GradientStop position=".72" colorValue="29786BEA">${bind('ambientMid',38)}</GradientStop>
<GradientStop position="1" colorValue="00786BEA">${bind('ambientEdge',38)}</GradientStop>
</RadialGradient></Fill></Shape>`
  const shadow=`<Shape x="92" y="190" opacity=".15" name="Original ground shadow">
<Ellipse width="108" height="18" originX=".5" originY=".5"/>${fill('FF786BEA','base')}</Shape>`
  const blush1=ellipse('Left cheek',77,118,28,14,'73F5A5D1','cheek','blushOpacity')
  const blush2=ellipse('Right cheek',163,118,28,14,'73F5A5D1','cheek','blushOpacity')
  return `<Artboard width="185" height="200" name="${key}" id="${id(2)}" viewModelId="0:300" viewModelInstanceId="0:301" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Artboard Style" id="${id(5)}"/>
<Node x="-28" name="Boo Artwork" id="${id(41)}">
${eyes}
${talk}
${smile}
${blush1}
${blush2}
${glow}
${body}
<Shape x="120" y="98" id="${id(42)}" name="Aura" opacity=".12"><Ellipse width="166" height="166" originX=".5" originY=".5"/>${fill('FF786BEA','base')}</Shape>
${ambient}
</Node>
${shadow}
<StateMachine name="BooMotion" id="${id(7)}"><StateMachineLayer name="Blink" id="${id(8)}">
<EntryState><StateTransition stateToId="${id(12)}"/></EntryState>
<AnimationState animationId="${id(6)}" id="${id(12)}"/>
</StateMachineLayer>
<StateMachineLayer name="Floating" id="${id(14)}"><EntryState><StateTransition stateToId="${id(16)}"/></EntryState><AnimationState animationId="${id(15)}" id="${id(16)}"/></StateMachineLayer>
<StateMachineLayer name="Aura pulse" id="${id(9)}"><EntryState><StateTransition stateToId="${id(13)}"/></EntryState><AnimationState animationId="${id(10)}" id="${id(13)}"/></StateMachineLayer>
</StateMachine>
<LinearAnimation name="Blink" duration="276" loopValue="loop" id="${id(6)}">
<KeyedObject objectId="${id(40)}"><KeyedProperty propertyKey="17">
<KeyFrameDouble value="1" frame="0" interpolationType="linear"/>
<KeyFrameDouble value="1" frame="254" interpolationType="linear"/>
<KeyFrameDouble value="0.06" frame="259" interpolationType="linear"/>
<KeyFrameDouble value="1" frame="264" interpolationType="linear"/>
<KeyFrameDouble value="1" frame="276" interpolationType="linear"/>
</KeyedProperty></KeyedObject>
</LinearAnimation>
<LinearAnimation name="Natural floating" duration="180" loopValue="loop" id="${id(15)}">
<KeyedObject objectId="${id(41)}"><KeyedProperty propertyKey="14">
<KeyFrameDouble value="0" frame="0" interpolationType="linear"/>
<KeyFrameDouble value="-1.45" frame="22" interpolationType="linear"/>
<KeyFrameDouble value="-5" frame="45" interpolationType="linear"/>
<KeyFrameDouble value="-8.55" frame="68" interpolationType="linear"/>
<KeyFrameDouble value="-10" frame="90" interpolationType="linear"/>
<KeyFrameDouble value="-8.55" frame="112" interpolationType="linear"/>
<KeyFrameDouble value="-5" frame="135" interpolationType="linear"/>
<KeyFrameDouble value="-1.45" frame="158" interpolationType="linear"/>
<KeyFrameDouble value="0" frame="180" interpolationType="linear"/>
</KeyedProperty></KeyedObject>
</LinearAnimation>
<LinearAnimation name="Aura breathing" duration="144" loopValue="loop" id="${id(10)}">
<KeyedObject objectId="${id(42)}"><KeyedProperty propertyKey="18">
<KeyFrameDouble value=".12" frame="0" interpolationType="linear"/>
<KeyFrameDouble value=".28" frame="72" interpolationType="linear"/>
<KeyFrameDouble value=".12" frame="144" interpolationType="linear"/>
</KeyedProperty></KeyedObject>
</LinearAnimation></Artboard>`
}
const vm=`<ViewModel name="BooColors" id="0:300" defaultInstanceId="0:301">
<ViewModelPropertyColor name="light" id="0:302"/><ViewModelPropertyColor name="base" id="0:303"/><ViewModelPropertyColor name="dark" id="0:304"/>
<ViewModelPropertyColor name="eyes" id="0:305"/><ViewModelPropertyColor name="cheek" id="0:306"/>
<ViewModelPropertyNumber name="smileOpacity" id="0:307"/><ViewModelPropertyNumber name="talkOpacity" id="0:308"/><ViewModelPropertyNumber name="blushOpacity" id="0:309"/>
<ViewModelPropertyNumber name="gazeX" id="0:310"/><ViewModelPropertyNumber name="gazeY" id="0:311"/>
<ViewModelPropertyColor name="ambientCenter" id="0:312"/><ViewModelPropertyColor name="ambientMid" id="0:313"/><ViewModelPropertyColor name="ambientEdge" id="0:314"/>
<ViewModelInstance exports="true" name="Default" id="0:301">
<ViewModelInstanceColor propertyValue="FFBCB5FF" viewModelPropertyId="0:302"/>
<ViewModelInstanceColor propertyValue="FF786BEA" viewModelPropertyId="0:303"/>
<ViewModelInstanceColor propertyValue="FF4A4190" viewModelPropertyId="0:304"/>
<ViewModelInstanceColor propertyValue="FFFFFFFF" viewModelPropertyId="0:305"/>
<ViewModelInstanceColor propertyValue="73F5A5D1" viewModelPropertyId="0:306"/>
<ViewModelInstanceNumber propertyValue="1" viewModelPropertyId="0:307"/>
<ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="0:308"/>
<ViewModelInstanceNumber propertyValue=".45" viewModelPropertyId="0:309"/>
<ViewModelInstanceNumber propertyValue="120" viewModelPropertyId="0:310"/><ViewModelInstanceNumber propertyValue="94" viewModelPropertyId="0:311"/>
<ViewModelInstanceColor propertyValue="3D786BEA" viewModelPropertyId="0:312"/>
<ViewModelInstanceColor propertyValue="29786BEA" viewModelPropertyId="0:313"/>
<ViewModelInstanceColor propertyValue="00786BEA" viewModelPropertyId="0:314"/>
</ViewModelInstance></ViewModel>`
const xml=`<Rive version="1" kind="fragment">\n${shapes.map((s,i)=>board(s.key,i,s.value)).join('\n')}\n${vm}\n</Rive>\n`
fs.writeFileSync(path.join(__dirname,'scene.rml'), xml, 'utf8')
console.log('Generated Rive XML for '+shapes.map(s=>s.key).join(', '))
