const $ = id => document.getElementById(id);
const canvas = $('mockupCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const previewCanvas = $('previewCanvas');
const pctx = previewCanvas.getContext('2d');
const statusEl = $('status');
const emptyState = $('emptyState');

const state = {
  shirt: null, originalPrint: null, print: null, printDataUrl: null, shirtDataUrl: 'camiseta-preta-padrao.png',
  x: 600, y: 585, scale: .43, rotation: 0, opacity: .98, skewX: 0, skewY: 0, blend: .38, folds: .20, curve: 0,
  dragging: false, dragDX: 0, dragDY: 0, history: [], undo: [], redo: [],
  shirtModel: 'preta', isDefaultShirt: true
};

const controls = ['scale','rotation','opacity','skewX','skewY','blend','folds','curve'];
const suffix = {scale:'%',rotation:'°',opacity:'%',skewX:'°',skewY:'°',blend:'%',folds:'%',curve:'%'};
const toState = {scale:v=>v/100,rotation:Number,opacity:v=>v/100,skewX:Number,skewY:Number,blend:v=>v/100,folds:v=>v/100,curve:v=>v/100};

function setStatus(text, loading=false){ statusEl.textContent=text; statusEl.classList.toggle('loading',loading); }
function imageFrom(src){ return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=reject; img.src=src; }); }
function fileDataUrl(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
function downloadBlob(blob,name){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1000); }
function canvasBlob(c,type='image/png',quality=1){ return new Promise(resolve=>c.toBlob(resolve,type,quality)); }
function snapshot(){ return {x:state.x,y:state.y,scale:state.scale,rotation:state.rotation,opacity:state.opacity,skewX:state.skewX,skewY:state.skewY,blend:state.blend,folds:state.folds,curve:state.curve}; }
function applySnapshot(s){ Object.assign(state,s); syncControls(); draw(); }
function pushUndo(){ state.undo.push(snapshot()); if(state.undo.length>40)state.undo.shift(); state.redo=[]; }

async function selectShirt(src, label='Preta', isDefault=true){
  setStatus(`Carregando camiseta ${label.toLowerCase()}...`, true);
  state.shirtDataUrl=src;
  state.shirt=await imageFrom(src);
  state.isDefaultShirt=isDefault;
  state.shirtModel=label.toLowerCase();
  if($('shirtThumb')) $('shirtThumb').src=src;
  document.querySelectorAll('.shirt-option').forEach(btn=>btn.classList.toggle('active', btn.dataset.shirt===src));
  draw();
  setStatus(`Camiseta ${label.toLowerCase()} selecionada`);
}
async function loadDefaultShirt(){ return selectShirt('camiseta-preta-padrao.png','Preta',true); }
function drawShirt(targetCtx,w,h){ if(state.shirt) targetCtx.drawImage(state.shirt,0,0,w,h); }

function drawPrint(targetCtx, targetW, targetH, print=state.print){
  if(!print)return;
  const sx=targetW/canvas.width, sy=targetH/canvas.height;
  const baseW=canvas.width*state.scale*sx;
  const baseH=baseW*(print.height/print.width);
  targetCtx.save();
  targetCtx.translate(state.x*sx,state.y*sy);
  targetCtx.rotate(state.rotation*Math.PI/180);
  targetCtx.transform(1,Math.tan(state.skewY*Math.PI/180),Math.tan(state.skewX*Math.PI/180),1,0,0);
  // Curvatura aproximada: fatias verticais com deslocamento suave.
  const slices=70, sw=baseW/slices;
  for(let i=0;i<slices;i++){
    const t=i/(slices-1), wave=Math.sin((t-.5)*Math.PI);
    const dx=-baseW/2+i*sw, dy=wave*baseH*state.curve;
    targetCtx.globalAlpha=state.opacity;
    targetCtx.globalCompositeOperation='source-over';
    targetCtx.drawImage(print,print.width*i/slices,0,print.width/slices+1,print.height,dx,dy-baseH/2,sw+1,baseH);
  }
  if(state.blend>0){
    targetCtx.globalAlpha=state.opacity*state.blend*.45;
    targetCtx.globalCompositeOperation='multiply';
    targetCtx.drawImage(print,-baseW/2,-baseH/2,baseW,baseH);
  }
  targetCtx.restore();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(state.shirt)drawShirt(ctx,canvas.width,canvas.height);
  if(state.print)drawPrint(ctx,canvas.width,canvas.height);
  // Reaplica detalhes da camiseta sobre a estampa para simular dobras.
  if(state.shirt&&state.print&&state.folds>0){
    ctx.save(); ctx.globalCompositeOperation='multiply'; ctx.globalAlpha=state.folds*.34; drawShirt(ctx,canvas.width,canvas.height); ctx.restore();
  }
  emptyState.classList.toggle('hidden',!!state.print);
}

function drawPreview(){
  pctx.clearRect(0,0,previewCanvas.width,previewCanvas.height); if(!state.print)return;
  const r=Math.min(previewCanvas.width/state.print.width,previewCanvas.height/state.print.height);
  const w=state.print.width*r,h=state.print.height*r; pctx.drawImage(state.print,(previewCanvas.width-w)/2,(previewCanvas.height-h)/2,w,h);
}

async function loadPrintFile(file){
  if(!file?.type.startsWith('image/'))return;
  setStatus('Carregando estampa...',true);
  const data=await fileDataUrl(file); state.printDataUrl=data; state.originalPrint=await imageFrom(data); state.print=state.originalPrint;
  $('printTools').classList.remove('hidden'); autoFit(false); drawPreview(); draw(); setStatus('Estampa carregada');
}

function edgeBg(data,w,h){
  const pts=[]; const step=Math.max(1,Math.floor(Math.min(w,h)/60));
  for(let x=0;x<w;x+=step){pts.push(pixel(data,w,x,0),pixel(data,w,x,h-1));}
  for(let y=0;y<h;y+=step){pts.push(pixel(data,w,0,y),pixel(data,w,w-1,y));}
  pts.sort((a,b)=>lum(a)-lum(b)); const mid=pts[Math.floor(pts.length/2)]; const close=pts.filter(c=>dist(c,mid)<52);
  return close.reduce((a,c)=>[a[0]+c[0],a[1]+c[1],a[2]+c[2]],[0,0,0]).map(v=>Math.round(v/Math.max(1,close.length)));
}
function pixel(d,w,x,y){const i=(y*w+x)*4;return[d[i],d[i+1],d[i+2]]} function lum(c){return c[0]*.2126+c[1]*.7152+c[2]*.0722} function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
async function localRemove(){
  if(!state.originalPrint)return; setStatus('Recortando fundo localmente...',true);
  const img=state.originalPrint,max=1800,r=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement('canvas');c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,c.width,c.height);
  const id=x.getImageData(0,0,c.width,c.height),d=id.data,bg=edgeBg(d,c.width,c.height),th=+$('tolerance').value*2.2,soft=Math.max(1,+$('feather').value*1.8);
  for(let i=0;i<d.length;i+=4){const dd=dist([d[i],d[i+1],d[i+2]],bg); if(dd<=th)d[i+3]=0; else if(dd<th+soft)d[i+3]=Math.round(255*(dd-th)/soft)}
  x.putImageData(id,0,0); state.print=await imageFrom(c.toDataURL('image/png')); drawPreview();draw();setStatus('Fundo removido pelo recorte local');
}

async function aiRemove(){
  if(!state.originalPrint)return;
  try{
    setStatus('Baixando IA e removendo fundo...',true); $('aiRemoveBtn').disabled=true;
    const mod=await import('https://esm.sh/@imgly/background-removal@1.7.0');
    const inputBlob=await (await fetch(state.printDataUrl)).blob();
    const result=await mod.removeBackground(inputBlob,{progress:(key,current,total)=>setStatus(`IA processando ${Math.round(current/total*100)}%`,true)});
    const url=URL.createObjectURL(result); state.print=await imageFrom(url); URL.revokeObjectURL(url); autoFit(false); drawPreview();draw();setStatus('Fundo removido com IA e estampa endireitada');
  }catch(err){ console.error(err); setStatus('IA indisponível; usando recorte local...',true); await localRemove(); }
  finally{$('aiRemoveBtn').disabled=false;}
}

function autoFit(record=true){
  if(!state.print)return; if(record)pushUndo();
  state.x=canvas.width*.5; state.y=canvas.height*.51;
  const aspect=state.print.width/state.print.height;
  state.scale=aspect>1.35?.52:aspect<.72?.31:.42; state.rotation=0;state.skewX=0;state.skewY=0;state.curve=0; syncControls();draw();setStatus('Estampa encaixada automaticamente');
}

function syncControls(){
  const vals={scale:state.scale*100,rotation:state.rotation,opacity:state.opacity*100,skewX:state.skewX,skewY:state.skewY,blend:state.blend*100,folds:state.folds*100,curve:state.curve*100};
  controls.forEach(k=>{ $(k).value=Math.round(vals[k]); $(`${k}Out`).textContent=`${Math.round(vals[k])}${suffix[k]}`; });
}

controls.forEach(k=>{
  let started=false;
  $(k).addEventListener('pointerdown',()=>{if(!started){pushUndo();started=true}});
  $(k).addEventListener('pointerup',()=>started=false);
  $(k).addEventListener('input',e=>{state[k]=toState[k](e.target.value);$(`${k}Out`).textContent=`${e.target.value}${suffix[k]}`;draw();});
});

function pointer(e){const r=canvas.getBoundingClientRect(),p=e.touches?.[0]||e;return{x:(p.clientX-r.left)*canvas.width/r.width,y:(p.clientY-r.top)*canvas.height/r.height}}
canvas.addEventListener('pointerdown',e=>{if(!state.print)return;const p=pointer(e),w=canvas.width*state.scale,h=w*state.print.height/state.print.width;if(Math.abs(p.x-state.x)<w/2&&Math.abs(p.y-state.y)<h/2){pushUndo();state.dragging=true;state.dragDX=p.x-state.x;state.dragDY=p.y-state.y;canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointermove',e=>{if(!state.dragging)return;const p=pointer(e);state.x=p.x-state.dragDX;state.y=p.y-state.dragDY;draw()});
canvas.addEventListener('pointerup',()=>state.dragging=false);
canvas.addEventListener('wheel',e=>{if(!state.print)return;e.preventDefault();pushUndo();state.scale=Math.min(1,Math.max(.05,state.scale+(e.deltaY<0?.025:-.025)));syncControls();draw()},{passive:false});

document.addEventListener('keydown',e=>{if(!state.print)return;if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();$('undoBtn').click()}if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();$('redoBtn').click()}const step=e.shiftKey?10:2;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();pushUndo();if(e.key==='ArrowUp')state.y-=step;if(e.key==='ArrowDown')state.y+=step;if(e.key==='ArrowLeft')state.x-=step;if(e.key==='ArrowRight')state.x+=step;draw()}});

$('undoBtn').onclick=()=>{if(!state.undo.length)return;state.redo.push(snapshot());applySnapshot(state.undo.pop())};
$('redoBtn').onclick=()=>{if(!state.redo.length)return;state.undo.push(snapshot());applySnapshot(state.redo.pop())};
$('centerBtn').onclick=()=>{pushUndo();state.x=600;state.y=585;draw()};
$('straightenBtn').onclick=()=>{if(!state.print)return;pushUndo();state.rotation=0;state.skewX=0;state.skewY=0;state.curve=0;syncControls();draw();setStatus('Estampa endireitada')};
$('autoFitBtn').onclick=()=>autoFit(true);
$('resetBtn').onclick=()=>{pushUndo();Object.assign(state,{x:600,y:585,scale:.43,rotation:0,opacity:.98,skewX:0,skewY:0,blend:.38,folds:.20,curve:0});syncControls();draw()};

$('printInput').onchange=e=>loadPrintFile(e.target.files[0]);
$('shirtInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;const d=await fileDataUrl(f);await selectShirt(d,'Personalizada',false)};
$('restoreShirtBtn').onclick=loadDefaultShirt;
$('aiRemoveBtn').onclick=aiRemove;$('localRemoveBtn').onclick=localRemove;
$('restorePrintBtn').onclick=()=>{state.originalPrint=null;state.print=null;state.printDataUrl=null;$('printTools').classList.add('hidden');$('printInput').value='';drawPreview();draw();setStatus('Estampa removida')};
['tolerance','feather'].forEach(k=>$(k).oninput=e=>$(`${k}Out`).textContent=e.target.value);

const dz=$('dropZone');['dragenter','dragover'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>loadPrintFile(e.dataTransfer.files[0]));

async function renderExport(size){
  const out=document.createElement('canvas');out.width=size;out.height=size;const ox=out.getContext('2d');
  if(state.shirt)drawShirt(ox,size,size);drawPrint(ox,size,size);
  if(state.shirt&&state.print&&state.folds>0){ox.save();ox.globalCompositeOperation='multiply';ox.globalAlpha=state.folds*.34;drawShirt(ox,size,size);ox.restore()}
  return out;
}
function addHistory(url){state.history.unshift(url);state.history=state.history.slice(0,6);$('historyCount').textContent=state.history.length;$('historyGrid').innerHTML=state.history.map((u,i)=>`<div class="history-item" data-i="${i}"><img src="${u}" alt="Mockup"><span>Baixar</span></div>`).join('');document.querySelectorAll('.history-item').forEach(el=>el.onclick=async()=>{const r=await fetch(state.history[+el.dataset.i]);downloadBlob(await r.blob(),`gataria-mockup-${Date.now()}.png`)})}
$('downloadBtn').onclick=async()=>{if(!state.print){setStatus('Carregue uma estampa primeiro');return}setStatus('Gerando PNG...',true);const size=+$('exportSize').value,out=await renderExport(size),blob=await canvasBlob(out);downloadBlob(blob,`gataria-mockup-${size}px-${Date.now()}.png`);addHistory(URL.createObjectURL(blob));setStatus(`Mockup ${size} × ${size} baixado`)};

$('saveBtn').onclick=async()=>{const project={version:2,shirtDataUrl:state.shirtDataUrl,printDataUrl:state.printDataUrl,isDefaultShirt:state.isDefaultShirt,shirtModel:state.shirtModel,settings:snapshot()};downloadBlob(new Blob([JSON.stringify(project)],{type:'application/json'}),`gataria-projeto-${Date.now()}.json`)};
$('loadProjectInput').onchange=async e=>{try{const project=JSON.parse(await e.target.files[0].text());state.shirtDataUrl=project.shirtDataUrl;state.shirt=await imageFrom(project.shirtDataUrl);state.isDefaultShirt=project.isDefaultShirt!==false;if($('shirtThumb'))$('shirtThumb').src=project.shirtDataUrl;if(project.printDataUrl){state.printDataUrl=project.printDataUrl;state.originalPrint=state.print=await imageFrom(project.printDataUrl);$('printTools').classList.remove('hidden');drawPreview()}applySnapshot(project.settings);setStatus('Projeto carregado')}catch(err){setStatus('Não foi possível abrir o projeto')}};

if($('continueBtn')) $('continueBtn').onclick=()=>{const steps=[...document.querySelectorAll('.step')],i=steps.findIndex(s=>s.classList.contains('active')),n=Math.min(i+1,2);steps.forEach((s,j)=>s.classList.toggle('active',j===n));$(steps[n].dataset.target).scrollIntoView({behavior:'smooth',block:'start'})};
document.querySelectorAll('.step').forEach(s=>s.onclick=()=>{document.querySelectorAll('.step').forEach(x=>x.classList.remove('active'));s.classList.add('active');$(s.dataset.target).scrollIntoView({behavior:'smooth',block:'start'})});

document.querySelectorAll('.shirt-option').forEach(btn=>btn.onclick=()=>selectShirt(btn.dataset.shirt,btn.dataset.label,true));
syncControls();loadDefaultShirt();
