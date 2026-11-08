(function(){
'use strict';
const DAY=86400000;
const CATS={cold:{label:'Cold brew',ph:'ph-cold'},foam:{label:'Cold foam',ph:'ph-foam'},pay:{label:'Pay',ph:'ph-pay'},hot:{label:'Caliente',ph:'ph-hot'}};
const METHODS={cash:{label:'Efectivo',icon:'i-cash',color:'var(--ink)'},mp:{label:'Mercado Pago',icon:'i-mp',color:'var(--accent)'},transfer:{label:'Transferencia',icon:'i-transfer',color:'var(--ink3)'}};
const TABS=[['caja','Caja','i-caja'],['ventas','Ventas','i-receipt'],['menu','Menú','i-box'],['numeros','Números','i-chart'],['mp','M. Pago','i-mp']];
const DEF_TICKET={title:'Café Frío',subtitle:'Cold brew · Chihuahua',footer:'¡Gracias por tu visita! Nos vemos en la combi.',ig:'@somoscafefrio',showLogo:true};
const COLS=['products','sales','entries','mp','config'];

const S={products:[],sales:[],entries:[],mp:[],config:[],tab:'caja',cat:'all',cart:{},order:[],customer:'',range:7,day:dayKey(Date.now()),
  orderOpen:false,ready:false,confirm:null,busy:false,search:'',searchOpen:false,featured:false};

/* ---------- utils ---------- */
const $=(s,r=document)=>r.querySelector(s);
const wide=()=>matchMedia('(min-width:900px)').matches;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(n){n=Math.round((+n||0)*100)/100;const int=Number.isInteger(n);return '$'+n.toLocaleString('es-MX',{minimumFractionDigits:int?0:2,maximumFractionDigits:2})}
function dayKey(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function startOfDay(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime()}
function hhmm(ts){return new Date(ts).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false})}
function longDate(ts){return new Date(ts).toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'})}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function icon(id,size=22){return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`}
function thumb(p){return p&&p.photo?`<img src="${esc(p.photo)}" alt="" draggable="false">`:`<svg viewBox="0 0 120 120" aria-hidden="true"><use href="#${CATS[p&&p.cat]?.ph||'ph-cold'}"/></svg>`}
let toastT;function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2400)}
function buzz(ms){try{navigator.vibrate&&navigator.vibrate(ms)}catch(e){}}
const prodById=id=>S.products.find(p=>p.id===id);
const sortedProducts=()=>[...S.products].sort((a,b)=>(a.order??999)-(b.order??999)||String(a.name).localeCompare(b.name));
const ticketCfg=()=>Object.assign({},DEF_TICKET,(S.config.find(c=>c.id==='ticket')||{}));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

/* ---------- almacenamiento en el dispositivo (IndexedDB, con respaldo en localStorage) ---------- */
let mem={products:{},sales:{},entries:{},mp:{},config:{}};
let idb=null;
function openIDB(){return new Promise(res=>{try{const r=indexedDB.open('cafefrio',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}})}
function idbGet(k){return new Promise(res=>{try{const t=idb.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>res(t.result);t.onerror=()=>res(undefined)}catch(e){res(undefined)}})}
function idbSet(k,v){return new Promise(res=>{try{const t=idb.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res(true);t.onerror=()=>res(false)}catch(e){res(false)}})}
async function persist(col){
  if(idb){const ok=await idbSet(col,mem[col]);if(ok)return}
  try{localStorage.setItem('cf-'+col,JSON.stringify(mem[col]))}catch(e){toast('El teléfono no tiene espacio para guardar más datos')}
}
async function loadAll(){
  idb=await openIDB();
  for(const c of COLS){
    let v=idb?await idbGet(c):undefined;
    if(v===undefined){try{const r=localStorage.getItem('cf-'+c);if(r)v=JSON.parse(r)}catch(e){}}
    mem[c]=v||{};
  }
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
}
function sync(){for(const k of COLS){S[k]=Object.entries(mem[k]).map(([id,v])=>({id,...v}));if(k!=='products'&&k!=='config')S[k].sort((a,b)=>b.ts-a.ts)}}
async function put(col,id,data){mem[col][id]=data;sync();render();await persist(col)}
async function patch(col,id,data){if(!mem[col][id])return;Object.assign(mem[col][id],data);sync();render();await persist(col)}
async function remove(col,id){delete mem[col][id];sync();render();await persist(col)}
function fail(){toast('No se pudo guardar. Inténtalo otra vez.')}

/* ---------- datos iniciales de la maqueta ---------- */
const SEED=[
  ['p-cb16','Cold brew clásico','cold',70,18,null,1,'img/cold-brew-clasico.jpg',true],
  ['p-cbvai','Cold brew vainilla','cold',80,22,null,2,'img/cold-brew-vainilla.jpg',false],
  ['p-cbhor','Cold brew horchata','cold',85,24,null,3,'img/cold-brew-horchata.jpg',false],
  ['p-foamv','Brew Chai','foam',90,26,null,4,'img/brew-chai.jpg',true],
  ['p-foamc','Apple Crunch','foam',90,27,null,5,'img/apple-crunch.jpg',true],
  ['p-pay','Pay','pay',50,18,12,6,'img/pay.jpg',false],
  ['p-amer','Americano','hot',45,10,null,7,'img/americano.jpg',false],
  ['p-latte','Latte','hot',60,16,null,8,'img/latte.jpg',false]
];
async function seedIfEmpty(){
  if(Object.keys(mem.products).length)return;
  for(const [id,name,cat,price,cost,stock,order,photo,featured] of SEED)mem.products[id]={name,cat,price,cost,stock,order,photo,featured,active:true};
  // ventas de prueba de los últimos 7 días
  let r=7;const rnd=()=>(r=(r*9301+49297)%233280)/233280;
  const w=[5,3,3,4,3,2,1,1];const tw=w.reduce((a,b)=>a+b,0);
  const pick=()=>{let x=rnd()*tw;for(let i=0;i<SEED.length;i++){x-=w[i];if(x<=0)return SEED[i]}return SEED[0]};
  const hours=[9,10,11,12,13,16,17,17,18,18,19,20];const folios={};const now=Date.now();
  const rows=[];
  for(let i=0;i<36;i++){const d=new Date(now-Math.floor(rnd()*7)*DAY);d.setHours(hours[Math.floor(rnd()*hours.length)],Math.floor(rnd()*60),0,0);if(d.getTime()>now)d.setTime(d.getTime()-DAY);
    const items=[];const n=[1,1,1,2,2,3][Math.floor(rnd()*6)];
    for(let k=0;k<n;k++){const p=pick();const ex=items.find(x=>x.pid===p[0]);if(ex)ex.qty++;else items.push({pid:p[0],name:p[1],qty:1,price:p[3],cost:p[4]})}
    rows.push({ts:d.getTime(),items})}
  rows.sort((a,b)=>a.ts-b.ts);
  rows.forEach((row,i)=>{const k=dayKey(row.ts);folios[k]=(folios[k]||0)+1;const total=row.items.reduce((s,x)=>s+x.qty*x.price,0);const m=rnd()<.5?'cash':rnd()<.8?'mp':'transfer';
    mem.sales['demo-'+i]={...row,total,method:m,folio:folios[k],demo:true,...(m==='cash'?{received:[100,200,500].find(b=>b>=total)||total}:{})}});
  for(const c of ['products','sales'])await persist(c);
}

/* ---------- orden ---------- */
function addItem(pid){const p=prodById(pid);if(!p)return;if(!S.cart[pid])S.order.push(pid);S.cart[pid]=(S.cart[pid]||0)+1;buzz(8);render()}
function decItem(pid){S.cart[pid]=(S.cart[pid]||0)-1;if(S.cart[pid]<=0){delete S.cart[pid];S.order=S.order.filter(x=>x!==pid)}render()}
function dropItem(pid){if(!S.cart[pid])return;const n=prodById(pid)?.name||'';delete S.cart[pid];S.order=S.order.filter(x=>x!==pid);buzz(25);toast('Quitado: '+n);render()}
function cartItems(){return S.order.map(pid=>{const p=prodById(pid);const q=S.cart[pid];return p&&q>0?{pid,name:p.name,qty:q,price:+p.price||0,cost:+p.cost||0}:null}).filter(Boolean)}
function cartTotal(){return cartItems().reduce((s,i)=>s+i.qty*i.price,0)}
function clearOrder(){S.cart={};S.order=[];S.customer='';S.orderOpen=false}
function nextFolio(){const d0=startOfDay(Date.now());const today=S.sales.filter(s=>s.ts>=d0);const mx=today.reduce((m,s)=>Math.max(m,+s.folio||0),0);return Math.max(mx,today.length)+1}
async function finalize(method,received){
  const items=cartItems();if(!items.length||S.busy)return;
  S.busy=true;
  const total=items.reduce((s,i)=>s+i.qty*i.price,0);
  const sale={ts:Date.now(),items,total,method,folio:nextFolio()};
  const c=S.customer.trim();if(c)sale.customer=c.slice(0,40);
  if(method==='cash'&&received>0)sale.received=received;
  const id=uid();
  try{
    clearOrder();
    await put('sales',id,sale);
    for(const it of items){const p=prodById(it.pid);if(p&&typeof p.stock==='number')mem.products[p.id].stock=p.stock-it.qty}
    await persist('products');sync();
    S.busy=false;render();
    openTicket({id,...sale},true);
  }catch(e){S.busy=false;render();fail()}
}
async function deleteSale(id){
  const s=S.sales.find(x=>x.id===id);if(!s)return;
  for(const it of s.items||[]){const p=mem.products[it.pid];if(p&&typeof p.stock==='number')p.stock+=(+it.qty||0)}
  await persist('products');await remove('sales',id);toast('Venta borrada');
}

/* ---------- ticket ---------- */
let logoImg=null;
function logoSVG(color){const d=$('#logo-path').getAttribute('d');return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1115 527" width="1115" height="527"><path fill="${color}" fill-rule="evenodd" d="${d}"/></svg>`}
async function getLogo(){if(logoImg)return logoImg;const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(logoSVG('#111111'));try{await img.decode()}catch(e){await new Promise(r=>{img.onload=r;img.onerror=r})}logoImg=img;return img}
function wrap(ctx,text,maxW){const words=String(text).split(/\s+/);const lines=[];let cur='';for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t}if(cur)lines.push(cur);return lines}
async function drawTicket(sale){
  const cfg=ticketCfg();
  try{await document.fonts.load('600 20px "IBM Plex Mono"');await document.fonts.load('400 20px "IBM Plex Mono"')}catch(e){}
  const W=576,P=40,K=2;const mono='"IBM Plex Mono",Menlo,monospace';
  const logo=cfg.showLogo?await getLogo():null;
  const run=(ctx)=>{
    let y=P;const C=W/2;
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,4000);ctx.fillStyle='#111111';ctx.textBaseline='alphabetic';
    if(logo){const lw=380,lh=lw*527/1115;try{ctx.drawImage(logo,C-lw/2,y,lw,lh)}catch(e){}y+=lh+22}
    else if(cfg.title){ctx.font=`600 34px ${mono}`;ctx.textAlign='center';ctx.fillText(cfg.title,C,y+30);y+=50}
    ctx.textAlign='center';
    if(cfg.subtitle){ctx.font=`400 19px ${mono}`;for(const l of wrap(ctx,cfg.subtitle,W-2*P)){ctx.fillText(l,C,y+18);y+=26}}
    y+=10;ctx.font=`400 18px ${mono}`;ctx.fillStyle='#444';
    const ds=new Date(sale.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})+' · '+hhmm(sale.ts);
    ctx.textAlign='left';ctx.fillText(ds,P,y+18);ctx.textAlign='right';ctx.fillText('Folio #'+String(sale.folio||'—').padStart(3,'0'),W-P,y+18);y+=30;
    if(sale.customer){ctx.textAlign='left';ctx.fillStyle='#111';ctx.font=`600 22px ${mono}`;ctx.fillText('Para: '+sale.customer,P,y+22);y+=34}
    const dash=()=>{y+=10;ctx.strokeStyle='#999';ctx.setLineDash([6,6]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(P,y);ctx.lineTo(W-P,y);ctx.stroke();ctx.setLineDash([]);y+=20};
    dash();ctx.fillStyle='#111';
    for(const it of sale.items||[]){
      ctx.font=`400 20px ${mono}`;const amt=money(it.qty*it.price);ctx.textAlign='right';const aw=ctx.measureText(amt).width;
      ctx.fillText(amt,W-P,y+20);ctx.textAlign='left';
      for(const l of wrap(ctx,(it.qty>1?it.qty+'× ':'')+it.name,W-2*P-aw-20)){ctx.fillText(l,P,y+20);y+=28}
      if(it.qty>1){ctx.fillStyle='#777';ctx.font=`400 16px ${mono}`;ctx.fillText(it.qty+' × '+money(it.price),P,y+14);y+=24;ctx.fillStyle='#111'}
      y+=4;
    }
    dash();
    ctx.font=`600 30px ${mono}`;ctx.textAlign='left';ctx.fillText('TOTAL',P,y+28);ctx.textAlign='right';ctx.fillText(money(sale.total),W-P,y+28);y+=46;
    ctx.font=`400 18px ${mono}`;ctx.fillStyle='#444';
    const kv=(k,v)=>{ctx.textAlign='left';ctx.fillText(k,P,y+18);ctx.textAlign='right';ctx.fillText(v,W-P,y+18);y+=28};
    kv('Pago',METHODS[sale.method]?.label||sale.method);
    if(sale.received){kv('Recibido',money(sale.received));kv('Cambio',money(sale.received-sale.total))}
    dash();ctx.fillStyle='#111';ctx.textAlign='center';
    if(cfg.footer){ctx.font=`400 19px ${mono}`;for(const l of wrap(ctx,cfg.footer,W-2*P)){ctx.fillText(l,C,y+18);y+=27}}
    if(cfg.ig){ctx.font=`600 20px ${mono}`;y+=6;ctx.fillText(cfg.ig,C,y+18);y+=28}
    return y+P-6;
  };
  const probe=document.createElement('canvas');probe.width=W;probe.height=4000;const H=Math.ceil(run(probe.getContext('2d')))+14;
  const c=document.createElement('canvas');c.width=W*K;c.height=H*K;const ctx=c.getContext('2d');ctx.scale(K,K);run(ctx);
  ctx.globalCompositeOperation='destination-out';ctx.beginPath();for(let x=0;x<=W;x+=16){ctx.moveTo(x,H);ctx.lineTo(x+8,H-10);ctx.lineTo(x+16,H)}ctx.fill();ctx.globalCompositeOperation='source-over';
  return c;
}
function ticketText(s){
  const cfg=ticketCfg();const L=[];
  L.push(cfg.title||'Café Frío');if(cfg.subtitle)L.push(cfg.subtitle);
  L.push(new Date(s.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})+' '+hhmm(s.ts)+' · Folio #'+String(s.folio||'').padStart(3,'0'));
  if(s.customer)L.push('Para: '+s.customer);
  L.push('—');(s.items||[]).forEach(i=>L.push((i.qty>1?i.qty+'× ':'')+i.name+'  '+money(i.qty*i.price)));
  L.push('—');L.push('TOTAL '+money(s.total)+' · '+(METHODS[s.method]?.label||''));
  if(s.received)L.push('Recibido '+money(s.received)+' · Cambio '+money(s.received-s.total));
  if(cfg.footer)L.push(cfg.footer);if(cfg.ig)L.push(cfg.ig);
  return L.join('\n');
}
let currentTicket=null;
async function openTicket(sale,fresh){
  currentTicket={sale,file:null};
  const fol=String(sale.folio||'').padStart(3,'0');
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><div class="sheet" role="dialog" aria-label="Ticket">
    ${fresh?`<div class="done"><span class="ok">${icon('i-check',22)}</span><div><div style="font-weight:700;font-size:18px">Cobrado ${money(sale.total)}</div><div class="sub">${METHODS[sale.method]?.label}${sale.received?' · cambio '+money(sale.received-sale.total):''} · folio #${fol}</div></div></div>`:`<h2>Ticket #${fol}</h2>`}
    <div class="ticketwrap" id="tkwrap"><div class="gen">Generando ticket…</div></div>
    <div class="sharegrid">
      <button class="btn ink wide" data-act="share-ticket">${icon('i-share',20)} Compartir ticket</button>
      <button class="btn ghost" data-act="share-text">${icon('i-chat',18)} Enviar como texto</button>
      <button class="btn ghost" data-act="copy-ticket">${icon('i-copy',18)} Copiar texto</button>
    </div>
    <button class="btn primary" style="padding:16px;font-size:17px" data-act="close-modal">${fresh?'Nueva orden':'Cerrar'}</button>
  </div></div>`;
  try{
    const c=await drawTicket(sale);
    if(!currentTicket||currentTicket.sale!==sale)return;
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    currentTicket.file=new File([blob],`ticket-cafe-frio-${fol}.png`,{type:'image/png'});
    const w=$('#tkwrap');if(w)w.innerHTML=`<img src="${URL.createObjectURL(blob)}" alt="Ticket de la venta">`;
  }catch(e){const w=$('#tkwrap');if(w)w.innerHTML=`<pre class="sel mono" style="white-space:pre-wrap;font-size:13px;margin:0">${esc(ticketText(sale))}</pre>`}
}
async function shareTicket(){
  if(!currentTicket)return;
  const f=currentTicket.file;
  try{
    if(f&&navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:'Ticket Café Frío'});return}
    if(navigator.share){await navigator.share({title:'Ticket Café Frío',text:ticketText(currentTicket.sale)});return}
  }catch(e){if(e&&e.name==='AbortError')return}
  if(f){const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove();toast('Ticket descargado')}
}
async function shareText(){
  if(!currentTicket)return;const text=ticketText(currentTicket.sale);
  try{if(navigator.share){await navigator.share({text});return}}catch(e){if(e&&e.name==='AbortError')return}
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}
function copyTicket(){
  if(!currentTicket)return;const txt=ticketText(currentTicket.sale);
  try{navigator.clipboard.writeText(txt).then(()=>toast('Ticket copiado'),()=>toast('No se pudo copiar'))}catch(e){toast('No se pudo copiar')}
}

/* ---------- escáner ---------- */
let scan=null;
function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`))return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
async function openScanner(){
  $('#modal').innerHTML=`<div class="modal" data-act="close-scan"><div class="sheet" role="dialog" aria-label="Escanear">
    <h2>Escanear código</h2>
    <div class="scanbox"><video id="scanvid" playsinline muted></video><div class="frame"></div></div>
    <div class="sub" id="scanmsg">Apunta al código de barras o QR del producto.</div>
    <div id="scanres"></div>
    <button class="btn ghost" data-act="close-scan">Cerrar</button>
  </div></div>`;
  try{
    await loadScript('https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js');
    const ZX=window.ZXing;const reader=new ZX.BrowserMultiFormatReader();
    scan={reader,busy:false};
    await reader.decodeFromConstraints({video:{facingMode:'environment'}},'scanvid',(res)=>{if(res&&scan&&!scan.busy){scan.busy=true;onScan(res.getText())}});
  }catch(e){const m=$('#scanmsg');if(m)m.textContent='No se pudo abrir la cámara. Revisa que la app tenga permiso de cámara en Ajustes.'}
}
function closeScanner(){try{scan&&scan.reader&&scan.reader.reset()}catch(e){}scan=null;$('#modal').innerHTML=''}
function onScan(code){
  code=String(code).trim();buzz(30);
  const p=S.products.find(x=>x.code&&String(x.code)===code);
  if(p){addItem(p.id);toast('+1 '+p.name);setTimeout(()=>{if(scan)scan.busy=false},1200);return}
  const box=$('#scanres');if(!box)return;
  box.innerHTML=`<div class="panel" style="display:flex;flex-direction:column;gap:10px"><div><b>Código nuevo:</b> <span class="mono sel">${esc(code)}</span></div>
    <div class="field"><label for="scanpick">Asignarlo a</label><select id="scanpick">${sortedProducts().map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="row"><button class="btn ghost" data-act="scan-again">Escanear otro</button><button class="btn primary" data-act="scan-assign" data-code="${esc(code)}">Asignar y agregar</button></div></div>`;
}

/* ---------- Mercado Pago ---------- */
function reconcile(){
  const mpSales=S.sales.filter(s=>s.method==='mp');const used=new Set();const match={};
  for(const m of S.mp){const s=mpSales.find(x=>x.mpRef===m.id);if(s){match[m.id]=s;used.add(s.id)}}
  for(const m of [...S.mp].filter(m=>!match[m.id]).sort((a,b)=>a.ts-b.ts)){
    const tol=Math.max(1,m.amount*0.06);let best=null,bd=Infinity;
    for(const s of mpSales){if(used.has(s.id))continue;const dt=Math.abs(s.ts-m.ts);if(dt>45*60000||Math.abs(s.total-m.amount)>tol)continue;if(dt<bd){bd=dt;best=s}}
    if(best){match[m.id]=best;used.add(best.id)}
  }
  return {match,orphanSales:mpSales.filter(s=>!used.has(s.id))};
}
function parseCSV(text){
  text=text.replace(/^﻿/,'');const first=text.split(/\r?\n/)[0]||'';
  const delim=(first.split(';').length>first.split(',').length)?';':(first.split('\t').length>first.split(',').length?'\t':',');
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===delim){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}
  if(f||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>String(x).trim()));
}
function parseAmount(v){v=String(v??'').replace(/[^\d,.\-]/g,'');if(!v)return NaN;const lc=v.lastIndexOf(','),ld=v.lastIndexOf('.');
  if(lc>-1&&ld>-1)v=lc>ld?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,'');else if(lc>-1)v=/,\d{1,2}$/.test(v)?v.replace(',','.'):v.replace(/,/g,'');return parseFloat(v)}
function parseDate(v){v=String(v||'').trim();if(!v)return NaN;const m=v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime()}return Date.parse(v)}
function pickCol(head,prefs){for(const re of prefs){const i=head.findIndex(h=>re.test(h));if(i>-1)return i}return -1}
async function importMP(file){
  const rows=parseCSV(await file.text());const hi=rows.findIndex(r=>r.some(c=>/fecha|date/i.test(c)));
  if(hi<0){toast('No encontré columnas de fecha en ese archivo');return}
  const head=rows[hi].map(h=>String(h).trim().toLowerCase());
  const cDate=pickCol(head,[/date_approved|fecha de aprobaci/,/date_created|fecha de (origen|creaci)/,/^fecha$|^date$/,/fecha|date/]);
  const cAmt=pickCol(head,[/transaction_amount|monto bruto|gross_amount|valor de la compra|monto de la operaci/,/^monto$|^importe$|^amount$/,/net_credit|net_amount|monto neto|neto recibido/,/monto|importe|amount|valor/]);
  const cRef=pickCol(head,[/source_id|operation_id|id de operaci|n[uú]mero de operaci/,/^id$|reference|referencia/]);
  const cDesc=pickCol(head,[/descrip|description|concepto/,/payment_method|medio de pago|tipo|type/]);
  if(cAmt<0){toast('No encontré la columna de monto');return}
  let n=0;
  for(const r of rows.slice(hi+1)){const amt=parseAmount(r[cAmt]);const ts=parseDate(r[cDate]);if(!(amt>0)||!isFinite(ts))continue;
    const ref=cRef>-1?String(r[cRef]).trim():'';const id='mp-'+(ref||(ts+'-'+amt));
    if(!mem.mp[id]){mem.mp[id]={ts,amount:amt,ref,desc:cDesc>-1?String(r[cDesc]).trim().slice(0,80):''};n++}}
  await persist('mp');sync();render();toast(n?n+' cobros nuevos importados':'No encontré cobros nuevos en ese archivo');
}
async function saleFromMP(id){const m=S.mp.find(x=>x.id===id);if(!m)return;
  await put('sales',uid(),{ts:m.ts,items:[{pid:'',name:'Cobro Mercado Pago',qty:1,price:m.amount,cost:0}],total:m.amount,method:'mp',mpRef:m.id,folio:0});toast('Venta registrada')}

/* ---------- respaldo ---------- */
function exportBackup(){
  const data=JSON.stringify({app:'cafefrio',v:1,exported:Date.now(),data:mem});
  const f=new File([data],`respaldo-cafe-frio-${dayKey(Date.now())}.json`,{type:'application/json'});
  (async()=>{try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:'Respaldo Café Frío'});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove()})();
}
async function importBackup(file){
  try{const j=JSON.parse(await file.text());if(!j||j.app!=='cafefrio'||!j.data)throw 0;
    for(const c of COLS){mem[c]=j.data[c]||{};await persist(c)}sync();render();toast('Respaldo restaurado')}
  catch(e){toast('Ese archivo no es un respaldo de Café Frío')}
}
function exportSalesCSV(){
  const rows=[['fecha','hora','folio','cliente','productos','total','pago']];
  [...S.sales].sort((a,b)=>a.ts-b.ts).forEach(s=>rows.push([dayKey(s.ts),hhmm(s.ts),s.folio||'',s.customer||'',(s.items||[]).map(i=>i.qty+'x '+i.name).join(' + '),s.total,METHODS[s.method]?.label||s.method]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const f=new File(['﻿'+csv],`ventas-cafe-frio-${dayKey(Date.now())}.csv`,{type:'text/csv'});
  (async()=>{try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove()})();
}

/* ---------- render ---------- */
function navHTML(){return TABS.map(([k,l,i])=>`<button class="navbtn" data-tab="${k}" ${S.tab===k?'aria-current="page"':''}>${icon(i,24)}<span>${l}</span></button>`).join('')}
function render(){
  const dk=document.documentElement.classList.contains('dark');
  const tools=$('#tools');
  tools.innerHTML=S.tab==='caja'?`
    <button class="toolbtn" data-act="scan" aria-label="Escanear código">${icon('i-scan',21)}</button>
    <button class="toolbtn" data-act="search" aria-pressed="${S.searchOpen}" aria-label="Buscar producto">${icon('i-search',21)}</button>
    <button class="toolbtn" data-act="featured" aria-pressed="${S.featured}" aria-label="Solo destacados">${icon('i-star',21)}</button>
    <button class="toolbtn" data-act="theme" aria-label="Cambiar modo claro u oscuro">${icon(dk?'i-sun':'i-moon',20)}</button>`
    :`<button class="toolbtn" data-act="theme" aria-label="Cambiar modo claro u oscuro">${icon(dk?'i-sun':'i-moon',20)}</button>`;
  $('#nav').innerHTML=navHTML();$('#railnav').innerHTML=navHTML();
  $('#app').classList.toggle('with-order',S.tab==='caja');
  const sb=$('#searchbar');sb.hidden=!(S.tab==='caja'&&S.searchOpen);
  const a=document.activeElement;const typing=a&&a.closest&&a.closest('#main')&&/INPUT|SELECT|TEXTAREA/.test(a.tagName);
  if(!typing)$('#main').innerHTML=({caja:viewCaja,ventas:viewSales,menu:viewMenu,numeros:viewStats,mp:viewMP})[S.tab]();
  renderOrder();
}
function viewCaja(){
  const all=sortedProducts().filter(p=>p.active!==false);
  const cats=Object.keys(CATS).filter(c=>all.some(p=>p.cat===c));
  const q=norm(S.search.trim());
  const ps=all.filter(p=>(S.cat==='all'||p.cat===S.cat)&&(!S.featured||p.featured)&&(!q||norm(p.name).includes(q)));
  let body;
  if(!S.ready)body=`<div class="empty">Cargando el menú…</div>`;
  else if(!all.length)body=`<div class="empty"><div><b>No hay productos en el menú.</b><br>Agrégalos en la pestaña Menú, con su foto, y aparecerán aquí listos para cobrar.</div></div>`;
  else if(!ps.length)body=`<div class="empty">${S.featured?'No hay productos destacados con este filtro. Marca la estrella en Menú para destacarlos.':'Ningún producto coincide con la búsqueda.'}</div>`;
  else body=`<div class="grid">${ps.map(p=>{const n=S.cart[p.id]||0;const hasS=typeof p.stock==='number';const out=hasS&&p.stock<=0;
    return `<button class="tile ${n?'on':''} ${out?'out':''}" data-tile="${p.id}" aria-label="Agregar ${esc(p.name)}"><span class="ph">${thumb(p)}</span><span class="meta"><span class="tn">${esc(p.name)}</span><span class="tp num">${money(p.price)}</span></span>${n?`<span class="q">${n}</span>`:''}${hasS?`<span class="stk ${p.stock<=5?'low':''}">${p.stock}</span>`:''}</button>`}).join('')}</div>
    ${S.order.length?`<div class="hint">Mantén presionado un producto para quitarlo de la orden.</div>`:''}`;
  return `<div class="section">
    <div class="chips" role="group" aria-label="Categorías">
      <button class="chip" data-cat="all" aria-pressed="${S.cat==='all'}">Todo</button>
      ${cats.map(c=>`<button class="chip" data-cat="${c}" aria-pressed="${S.cat===c}">${CATS[c].label}<span class="c">${all.filter(p=>p.cat===c).length}</span></button>`).join('')}
    </div>
    ${body}
  </div>`;
}
function renderOrder(){
  const host=$('#orderhost'),bar=$('#obar');
  if(S.tab!=='caja'){host.innerHTML='';bar.hidden=true;return}
  const a=document.activeElement;if(a&&a.id==='cust'&&host.contains(a))return;
  const items=cartItems(),total=cartTotal(),n=items.reduce((s,i)=>s+i.qty,0);
  const W=wide();
  bar.hidden=W||!n||S.orderOpen;
  bar.innerHTML=`<button data-act="open-order"><span class="cnt">${n}</span><span class="sp">Ver orden</span><span class="t num">${money(total)}</span></button>`;
  if(!W&&!S.orderOpen){host.innerHTML='';return}
  const lines=items.length?items.map(i=>{const p=prodById(i.pid);return `<div class="oline"><span class="th">${thumb(p)}</span><div style="min-width:0"><div class="n">${esc(i.name)}</div><div class="p num">${money(i.price)}${i.qty>1?' · '+money(i.qty*i.price):''}</div></div><span class="step"><button data-dec="${i.pid}" aria-label="Quitar uno">−</button><span>${i.qty}</span><button data-add="${i.pid}" aria-label="Agregar uno">+</button></span></div>`}).join('')
    :`<div class="empty-o"><svg class="logo" viewBox="0 0 1115 527" aria-hidden="true"><use href="#logo"/></svg><div>Toca un producto para empezar la orden.</div></div>`;
  const dis=!items.length||S.busy?'disabled':'';
  host.innerHTML=`${!W?`<div class="scrim" data-act="close-order"></div>`:''}<aside class="order" aria-label="Orden actual">
    ${!W?`<span class="grab"></span>`:''}
    <div class="oh"><h2>Orden${n?' · '+n:''}</h2><span class="f">Folio #${String(nextFolio()).padStart(3,'0')}</span></div>
    <div class="lines">${lines}</div>
    <div class="of">
      <input id="cust" class="cust" placeholder="Nombre del cliente (opcional)" value="${esc(S.customer)}" autocomplete="off" maxlength="40">
      <div class="tot"><span class="l">Total</span><span class="v num">${money(total)}</span></div>
      <div class="pay">
        <button class="main" data-pay="cash" ${dis}>${icon('i-cash',22)} Efectivo</button>
        <button data-pay="mp" ${dis}>${icon('i-mp',20)} Mercado Pago</button>
        <button data-pay="transfer" ${dis}>${icon('i-transfer',20)} Transferencia</button>
      </div>
      ${items.length?`<button class="linkbtn" data-act="clear-order" style="align-self:center">Cancelar orden</button>`:''}
    </div>
  </aside>`;
}
function openTender(){
  const total=cartTotal();if(!total)return;tendered=0;
  const bills=[50,100,200,500,1000].filter(b=>b>total).slice(0,3);
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><div class="sheet" role="dialog" aria-label="Cobro en efectivo">
    <h2>Efectivo</h2>
    <div class="bigtot num">${money(total)}</div>
    <div class="tender" id="tender">
      <button data-tend="${total}" aria-pressed="false">Exacto</button>
      ${bills.map(b=>`<button data-tend="${b}" aria-pressed="false">${money(b)}</button>`).join('')}
    </div>
    <div class="field"><label for="tend-in">Otro monto recibido</label><input id="tend-in" inputmode="decimal" placeholder="$0"></div>
    <div class="changebox" id="chg">Elige cuánto te dieron</div>
    <button class="btn primary" style="padding:16px;font-size:17px" data-act="confirm-cash" id="cashgo">Cobrar ${money(total)}</button>
  </div></div>`;
}
let tendered=0;
function setTender(v){tendered=v;const total=cartTotal();const c=$('#chg');if(!c)return;
  if(!(v>0)){c.textContent='Elige cuánto te dieron';$('#cashgo').disabled=false;return}
  c.innerHTML=v>=total?`Cambio <b class="num">${money(v-total)}</b>`:`Faltan <b class="num">${money(total-v)}</b>`;
  $('#cashgo').disabled=v<total}

function saleRow(s){
  const items=(s.items||[]).map(i=>(i.qty>1?i.qty+'× ':'')+i.name).join(', ');const cf=S.confirm===s.id;
  return `<div class="item click" data-ticket="${s.id}"><span class="time">${hhmm(s.ts)}</span><div style="min-width:0"><div class="t1">${s.customer?esc(s.customer)+' · ':''}${esc(items||'Venta')}</div><div class="t2"><span class="pill ${s.method==='mp'?'acc':''}">${METHODS[s.method]?.label||s.method}</span>${s.folio?' · #'+String(s.folio).padStart(3,'0'):''}</div></div>
  <div style="display:flex;align-items:center;gap:8px"><span class="amt num">${money(s.total)}</span>${cf?`<button class="iconbtn warn" data-delsale="${s.id}">¿Borrar?</button>`:`<button class="iconbtn" data-confirm="${s.id}" aria-label="Borrar venta">${icon('i-trash',18)}</button>`}</div></div>`;
}
function viewSales(){
  const d0=new Date(S.day+'T00:00:00').getTime();const list=S.sales.filter(s=>s.ts>=d0&&s.ts<d0+DAY).sort((a,b)=>b.ts-a.ts);
  const tot=list.reduce((a,s)=>a+s.total,0);const by={};list.forEach(s=>by[s.method]=(by[s.method]||0)+s.total);
  const t=dayKey(Date.now()),y=dayKey(Date.now()-DAY);
  return `<div class="section">
    <div><h1 class="h1">Ventas</h1><div class="sub" style="text-transform:capitalize">${esc(longDate(d0))}</div></div>
    <div class="row" style="align-items:flex-end">
      <div class="chips" style="flex:0 0 auto;min-width:0"><button class="chip" data-day="${t}" aria-pressed="${S.day===t}">Hoy</button><button class="chip" data-day="${y}" aria-pressed="${S.day===y}">Ayer</button></div>
      <div class="field" style="max-width:220px"><label for="daypick">Otro día</label><input type="date" id="daypick" value="${S.day}"></div>
    </div>
    <div class="kpis">
      <div class="kpi hero"><span class="l">Total del día</span><span class="v num">${money(tot)}</span><span class="d">${list.length} ${list.length===1?'venta':'ventas'}</span></div>
      ${Object.entries(METHODS).map(([k,m])=>`<div class="kpi"><span class="l">${m.label}</span><span class="v num">${money(by[k]||0)}</span></div>`).join('')}
    </div>
    <div class="panel">${list.length?`<div class="sub" style="margin-bottom:4px">Toca una venta para ver o compartir su ticket.</div><div class="list">${list.map(saleRow).join('')}</div>`:`<div class="empty">No hay ventas registradas este día.</div>`}</div>
  </div>`;
}
function viewMenu(){
  const ps=sortedProducts();const cfg=ticketCfg();const demo=S.sales.filter(s=>s.demo).length;
  return `<div class="section">
    <div class="row" style="align-items:center"><div><h1 class="h1">Menú</h1><div class="sub">${ps.length} productos · fotos, precios e inventario</div></div>
    <button class="btn primary" style="flex:0 0 auto" data-act="new-product">${icon('i-plus',18)} Nuevo producto</button></div>
    ${Object.keys(CATS).map(c=>{const list=ps.filter(p=>p.cat===c);return `<div class="panel"><h3>${CATS[c].label}</h3>${list.length?`<div class="list">${list.map(p=>{const m=p.price>0&&p.cost>0?Math.round((1-p.cost/p.price)*100):null;
      return `<div class="item prodrow"><span class="th">${thumb(p)}</span><div style="min-width:0"><div class="t1">${esc(p.name)}${p.featured?' <span class="pill acc">destacado</span>':''}${p.active===false?' <span class="pill">oculto</span>':''}</div><div class="t2">${money(p.price)} · costo ${money(p.cost||0)}${m!==null?' · margen '+m+'%':''}${typeof p.stock==='number'?' · '+p.stock+' en stock':''}${p.code?' · código '+esc(p.code):''}</div></div>
      <div style="display:flex;gap:6px">${typeof p.stock==='number'?`<button class="iconbtn" data-entry="${p.id}" aria-label="Entrada de inventario">${icon('i-plus',18)}</button>`:''}<button class="iconbtn" data-edit="${p.id}" aria-label="Editar ${esc(p.name)}">${icon('i-edit',18)}</button></div></div>`}).join('')}</div>`:`<div class="sub">${c==='hot'?'Para la temporada de invierno: agrega aquí los cafés calientes cuando estén listos.':'Sin productos en esta categoría.'}</div>`}</div>`}).join('')}
    <div class="panel"><h3>Ticket</h3>
      <div class="row">
        <div class="field"><label for="tk-title">Nombre</label><input id="tk-title" value="${esc(cfg.title)}"></div>
        <div class="field"><label for="tk-sub">Subtítulo</label><input id="tk-sub" value="${esc(cfg.subtitle)}"></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="field"><label for="tk-foot">Mensaje al final</label><input id="tk-foot" value="${esc(cfg.footer)}"></div>
        <div class="field"><label for="tk-ig">Instagram</label><input id="tk-ig" value="${esc(cfg.ig)}"></div>
      </div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="tk-logo" ${cfg.showLogo?'checked':''}> Mostrar el logo en el ticket</label>
      <div class="row" style="margin-top:12px"><button class="btn ghost" style="flex:0 0 auto" data-act="preview-ticket">Ver ejemplo</button><button class="btn ink" style="flex:0 0 auto" data-act="save-ticket">Guardar ticket</button></div>
    </div>
    <div class="panel"><h3>Datos y respaldo</h3>
      <div class="sub" style="margin-bottom:12px">Las ventas se guardan en este teléfono. Haz un respaldo de vez en cuando para no perderlas si cambias de teléfono.</div>
      <div class="row">
        <button class="btn ghost" style="flex:0 0 auto" data-act="backup">Crear respaldo</button>
        <label class="btn ghost" style="flex:0 0 auto" for="restore">Restaurar respaldo</label><input type="file" id="restore" accept=".json,application/json" hidden>
        <button class="btn ghost" style="flex:0 0 auto" data-act="csv">Exportar ventas (CSV)</button>
        ${demo?`<button class="btn ghost" style="flex:0 0 auto;color:var(--accent)" data-act="clear-demo">Borrar ${demo} ventas de prueba</button>`:''}
      </div>
    </div>
  </div>`;
}
function barSVG(vals,labels,{hi=-1,every=1}={}){
  const W=640,H=220,L=46,R=8,T=12,B=28;const max=Math.max(...vals,0);
  const nice=max<=0?100:(()=>{const p=Math.pow(10,Math.floor(Math.log10(max)));const m=max/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p})();
  const cw=(W-L-R)/vals.length,bw=Math.max(3,cw*0.66);const y=v=>T+(H-T-B)*(1-v/nice);
  let g='';for(const t of [0,nice/2,nice]){g+=`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" ${t?'stroke-dasharray="3 4"':''}/><text x="${L-6}" y="${y(t)+4}" text-anchor="end">${t>=1000?'$'+(t/1000)+'k':'$'+t}</text>`}
  let b='';vals.forEach((v,i)=>{const x=L+i*cw+(cw-bw)/2;if(v>0)b+=`<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${((H-T-B)*(v/nice)).toFixed(1)}" rx="${Math.min(4,bw/3)}" fill="${i===hi?'var(--accent)':'var(--ink3)'}"><title>${esc(labels[i])}: ${money(v)}</title></rect>`;
    if(i%every===0||i===vals.length-1)b+=`<text x="${(L+i*cw+cw/2).toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(labels[i])}</text>`});
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de ventas">${g}${b}</svg>`;
}
function viewStats(){
  const now=Date.now(),start=startOfDay(now)-(S.range-1)*DAY;const list=S.sales.filter(s=>s.ts>=start);const prevL=S.sales.filter(s=>s.ts>=start-S.range*DAY&&s.ts<start);
  const tot=list.reduce((a,s)=>a+s.total,0),prev=prevL.reduce((a,s)=>a+s.total,0);
  const cost=list.reduce((a,s)=>a+(s.items||[]).reduce((b,i)=>b+(+i.cost||0)*(+i.qty||0),0),0);
  const units=list.reduce((a,s)=>a+(s.items||[]).reduce((b,i)=>b+(+i.qty||0),0),0);
  const delta=prev>0?Math.round((tot-prev)/prev*100):null;
  const chips=[[1,'Hoy'],[7,'7 días'],[30,'30 días'],[90,'90 días']].map(([v,l])=>`<button class="chip" data-range="${v}" aria-pressed="${S.range===v}">${l}</button>`).join('');
  const head=`<div><h1 class="h1">Números</h1><div class="sub">${S.range===1?'Hoy':'Últimos '+S.range+' días'}</div></div><div class="chips">${chips}</div>`;
  if(!list.length)return `<div class="section">${head}<div class="empty">Aún no hay ventas en este periodo. En cuanto cobres en Caja, aquí verás totales, hora pico y lo que más se vende.</div></div>`;
  let chart;
  if(S.range===1){const hrs=[];for(let h=7;h<=22;h++)hrs.push(h);const v=hrs.map(h=>list.filter(s=>new Date(s.ts).getHours()===h).reduce((a,s)=>a+s.total,0));chart={t:'Ventas por hora',svg:barSVG(v,hrs.map(h=>h+'h'),{hi:v.indexOf(Math.max(...v)),every:2})}}
  else{const days=[];for(let i=S.range-1;i>=0;i--)days.push(startOfDay(now)-i*DAY);const v=days.map(d=>list.filter(s=>s.ts>=d&&s.ts<d+DAY).reduce((a,s)=>a+s.total,0));
    chart={t:'Ventas por día',svg:barSVG(v,days.map(d=>S.range<=7?new Date(d).toLocaleDateString('es-MX',{weekday:'short'}).replace('.',''):String(new Date(d).getDate())),{hi:v.length-1,every:S.range<=7?1:S.range<=30?3:10})}}
  const hours={};list.forEach(s=>{const h=new Date(s.ts).getHours();hours[h]=(hours[h]||0)+1});const peak=Object.entries(hours).sort((a,b)=>b[1]-a[1])[0];
  const top={};list.forEach(s=>(s.items||[]).forEach(i=>{top[i.name]=top[i.name]||{q:0,r:0};top[i.name].q+=+i.qty||0;top[i.name].r+=(+i.qty||0)*(+i.price||0)}));
  const topA=Object.entries(top).sort((a,b)=>b[1].r-a[1].r).slice(0,6),tm=topA[0]?topA[0][1].r:1;
  const catT={};list.forEach(s=>(s.items||[]).forEach(i=>{const c=prodById(i.pid)?.cat||'otro';catT[c]=(catT[c]||0)+(+i.qty||0)*(+i.price||0)}));
  const by={};list.forEach(s=>by[s.method]=(by[s.method]||0)+s.total);
  const wd={};list.forEach(s=>{const d=new Date(s.ts).getDay();wd[d]=(wd[d]||0)+s.total});const bw=Object.entries(wd).sort((a,b)=>b[1]-a[1])[0];
  const wdn=d=>['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d];
  return `<div class="section">${head}
    <div class="kpis">
      <div class="kpi hero"><span class="l">Ventas</span><span class="v num">${money(tot)}</span><span class="d">${delta===null?'sin periodo previo':(delta>=0?'▲ ':'▼ ')+Math.abs(delta)+'% vs periodo anterior'}</span></div>
      <div class="kpi"><span class="l">Órdenes</span><span class="v num">${list.length}</span><span class="d">${units} productos</span></div>
      <div class="kpi"><span class="l">Ticket promedio</span><span class="v num">${money(tot/list.length)}</span><span class="d">por orden</span></div>
      <div class="kpi"><span class="l">Utilidad estimada</span><span class="v num">${money(tot-cost)}</span><span class="d">${cost>0?Math.round((tot-cost)/tot*100)+'% margen bruto':'agrega costos en Menú'}</span></div>
    </div>
    <div class="panel chart"><h3>${chart.t}</h3>${chart.svg}<div class="sub" style="margin-top:6px">${peak?`Hora más movida: <b>${peak[0]}:00</b> (${peak[1]} órdenes).`:''}${bw&&S.range>=7?` Día más fuerte: <b>${wdn(+bw[0])}</b>.`:''}</div></div>
    <div class="two">
      <div class="panel"><h3>Lo que más se vende</h3>${topA.map(([n,v])=>`<div class="hbar"><span class="nm">${esc(n)}</span><span class="vv num">${v.q} · ${money(v.r)}</span><span class="tr"><i style="width:${(v.r/tm*100).toFixed(1)}%"></i></span></div>`).join('')}</div>
      <div class="panel"><h3>Cómo te pagan</h3>
        <div class="split">${Object.entries(METHODS).map(([k,m])=>by[k]?`<i style="width:${(by[k]/tot*100).toFixed(2)}%;background:${m.color}" title="${m.label}"></i>`:'').join('')}</div>
        <div class="legend">${Object.entries(METHODS).map(([k,m])=>`<span><i style="background:${m.color}"></i>${m.label} <b class="mono num">${Math.round((by[k]||0)/tot*100)}%</b></span>`).join('')}</div>
        <h3 style="margin-top:18px">Por categoría</h3>
        ${Object.entries(catT).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="hbar"><span class="nm">${CATS[c]?.label||'Otros'}</span><span class="vv num">${money(v)}</span><span class="tr"><i style="width:${(v/tot*100).toFixed(1)}%"></i></span></div>`).join('')}
      </div>
    </div>
  </div>`;
}
function viewMP(){
  const {match,orphanSales}=reconcile();const L=[...S.mp].sort((a,b)=>b.ts-a.ts);const tot=L.reduce((a,m)=>a+m.amount,0);const ok=L.filter(m=>match[m.id]).length;
  return `<div class="section">
    <div><h1 class="h1">Mercado Pago</h1><div class="sub">Compara tus cobros con las ventas registradas</div></div>
    <div class="panel"><h3>Importar reporte</h3>
      <ol class="steps"><li>En tu cuenta de Mercado Pago (desde la computadora) abre <b>Reportes</b>.</li><li>Genera el reporte de cobros o de actividad del periodo y descárgalo en <b>CSV</b>.</li><li>Súbelo aquí: cada cobro se empata con una venta marcada como Mercado Pago del mismo monto (±45 min).</li></ol>
      <label class="btn primary" for="mpfile" style="margin-top:12px">${icon('i-mp',18)} Elegir archivo CSV</label><input type="file" id="mpfile" accept=".csv,text/csv,text/plain" hidden>
    </div>
    ${L.length?`<div class="kpis">
      <div class="kpi hero"><span class="l">Cobros importados</span><span class="v num">${money(tot)}</span><span class="d">${L.length} movimientos</span></div>
      <div class="kpi"><span class="l">Empatados</span><span class="v num">${ok}</span><span class="d">con una venta</span></div>
      <div class="kpi"><span class="l">Sin venta</span><span class="v num">${L.length-ok}</span><span class="d">cobrado, no registrado</span></div>
      <div class="kpi"><span class="l">Ventas sin cobro</span><span class="v num">${orphanSales.length}</span><span class="d">marcadas MP, sin movimiento</span></div>
    </div>
    <div class="panel"><h3>Movimientos</h3><div class="list">${L.slice(0,150).map(m=>{const s=match[m.id];return `<div class="item"><span class="time">${new Date(m.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}<br>${hhmm(m.ts)}</span><div style="min-width:0"><div class="t1">${esc(m.desc||'Cobro')}</div><div class="t2">${s?`<span class="pill">empatado</span> venta de las ${hhmm(s.ts)}`:`<span class="pill acc">sin venta</span>`}${m.ref?' · #'+esc(m.ref):''}</div></div><div style="display:flex;align-items:center;gap:8px"><span class="amt num">${money(m.amount)}</span>${!s?`<button class="btn ghost" style="padding:6px 10px;font-size:12px" data-mpsale="${esc(m.id)}">Registrar</button>`:''}</div></div>`}).join('')}</div></div>
    ${orphanSales.length?`<div class="panel"><h3>Ventas Mercado Pago sin cobro en el reporte</h3><div class="list">${orphanSales.slice(0,60).map(saleRow).join('')}</div></div>`:''}`
    :`<div class="empty">Todavía no has importado movimientos. Cuando lo hagas, verás qué cobros ya están registrados y cuáles faltan.</div>`}
  </div>`;
}

/* ---------- productos ---------- */
let draftPhoto;
function openProduct(id){
  const p=id?prodById(id):{name:'',cat:S.cat!=='all'?S.cat:'cold',price:'',cost:'',stock:null,active:true};
  draftPhoto=p.photo||null;const track=typeof p.stock==='number';
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><form class="sheet" onsubmit="return false" aria-label="Producto">
    <h2>${id?'Editar producto':'Nuevo producto'}</h2>
    <div class="photo-edit"><span class="th" id="p-th">${thumb({photo:draftPhoto,cat:p.cat})}</span>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start"><label class="btn ink" for="p-file">${draftPhoto?'Cambiar foto':'Agregar foto'}</label><input type="file" id="p-file" accept="image/*" hidden>
      <button type="button" class="linkbtn" data-act="rm-photo" ${draftPhoto?'':'hidden'} id="p-rm">Quitar foto</button></div></div>
    <div class="field"><label for="p-name">Nombre</label><input id="p-name" value="${esc(p.name)}" placeholder="Cold brew clásico"></div>
    <div class="row">
      <div class="field"><label for="p-cat">Categoría</label><select id="p-cat">${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${p.cat===k?'selected':''}>${c.label}</option>`).join('')}</select></div>
      <div class="field"><label for="p-order">Posición</label><input id="p-order" inputmode="numeric" value="${esc(p.order??'')}" placeholder="1"></div>
    </div>
    <div class="row">
      <div class="field"><label for="p-price">Precio</label><input id="p-price" inputmode="decimal" value="${esc(p.price)}" placeholder="$70"></div>
      <div class="field"><label for="p-cost">Costo por pieza</label><input id="p-cost" inputmode="decimal" value="${esc(p.cost)}" placeholder="$18"></div>
    </div>
    <div class="row">
      <div class="field"><label for="p-track">Inventario</label><select id="p-track"><option value="no" ${!track?'selected':''}>No llevar stock</option><option value="yes" ${track?'selected':''}>Llevar stock</option></select></div>
      <div class="field"><label for="p-stock">Piezas</label><input id="p-stock" inputmode="numeric" value="${track?p.stock:''}" placeholder="0"></div>
    </div>
    <div class="field"><label for="p-code">Código de barras o QR (opcional)</label><input id="p-code" value="${esc(p.code||'')}" placeholder="Escanéalo desde Caja para asignarlo"></div>
    <label class="check"><input type="checkbox" id="p-feat" ${p.featured?'checked':''}> Destacado (aparece con la estrella)</label>
    <label class="check"><input type="checkbox" id="p-active" ${p.active!==false?'checked':''}> Mostrar en Caja</label>
    <div class="row">
      ${id?`<button type="button" class="btn ghost" style="flex:0 0 auto;color:var(--accent)" data-act="del-product" data-id="${id}">Borrar</button>`:''}
      <button type="button" class="btn ghost" data-act="close-modal">Cancelar</button>
      <button type="submit" class="btn primary" data-act="save-product" data-id="${id||''}">Guardar</button>
    </div>
  </form></div>`;
}
async function loadPhoto(file){
  const url=URL.createObjectURL(file);const img=new Image();img.src=url;
  try{await img.decode()}catch(e){await new Promise(r=>{img.onload=r;img.onerror=r})}
  const size=420,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');
  const s=Math.min(img.naturalWidth,img.naturalHeight);if(!s){toast('No se pudo leer la imagen');return}
  ctx.drawImage(img,(img.naturalWidth-s)/2,(img.naturalHeight-s)/2,s,s,0,0,size,size);URL.revokeObjectURL(url);
  draftPhoto=c.toDataURL('image/jpeg',0.8);
  $('#p-th').innerHTML=thumb({photo:draftPhoto});$('#p-rm').hidden=false;
}
async function saveProduct(id){
  const name=$('#p-name').value.trim();if(!name){toast('Ponle nombre al producto');return}
  const price=parseAmount($('#p-price').value),cost=parseAmount($('#p-cost').value);if(!(price>=0)){toast('Escribe un precio válido');return}
  const track=$('#p-track').value==='yes',st=parseInt($('#p-stock').value,10),ord=parseInt($('#p-order').value,10);
  const data={name,cat:$('#p-cat').value,price,cost:cost>=0?cost:0,stock:track?(isFinite(st)?st:0):null,active:$('#p-active').checked,featured:$('#p-feat').checked,order:isFinite(ord)?ord:999,code:$('#p-code').value.trim()};
  if(draftPhoto)data.photo=draftPhoto;
  $('#modal').innerHTML='';await put('products',id||uid(),data);toast(id?'Producto actualizado':'Producto agregado');
}
function openEntry(id){const p=prodById(id);if(!p)return;
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><form class="sheet" onsubmit="return false"><h2>Entrada de inventario</h2>
  <div><b>${esc(p.name)}</b> · <span class="mono">${p.stock} en stock</span></div>
  <div class="row"><div class="field"><label for="e-qty">Piezas que llegaron</label><input id="e-qty" inputmode="numeric" placeholder="12"></div><div class="field"><label for="e-cost">Costo total (opcional)</label><input id="e-cost" inputmode="decimal" placeholder="$0"></div></div>
  <div class="row"><button type="button" class="btn ghost" data-act="close-modal">Cancelar</button><button type="submit" class="btn primary" data-act="save-entry" data-id="${id}">Sumar</button></div></form></div>`}
async function saveEntry(id){const p=prodById(id);const q=parseInt($('#e-qty').value,10);if(!(q>0)){toast('Escribe cuántas piezas llegaron');return}const c=parseAmount($('#e-cost').value);
  $('#modal').innerHTML='';mem.products[id].stock=(p.stock||0)+q;await persist('products');await put('entries',uid(),{ts:Date.now(),pid:id,name:p.name,qty:q,cost:c>0?c:0});toast('+'+q+' '+p.name)}
function readTicketForm(){return {title:$('#tk-title').value.trim(),subtitle:$('#tk-sub').value.trim(),footer:$('#tk-foot').value.trim(),ig:$('#tk-ig').value.trim(),showLogo:$('#tk-logo').checked}}

/* ---------- toque largo en productos: quitar de la orden ---------- */
let lp=null,suppressClick=false;
document.addEventListener('pointerdown',e=>{
  const t=e.target.closest('[data-tile]');if(!t)return;
  const pid=t.dataset.tile;lp={x:e.clientX,y:e.clientY,el:t,timer:setTimeout(()=>{if(S.cart[pid]){t.classList.add('pressing');dropItem(pid);suppressClick=true}lp=null},480)};
});
const cancelLP=()=>{if(lp){clearTimeout(lp.timer);lp.el.classList.remove('pressing');lp=null}};
document.addEventListener('pointermove',e=>{if(lp&&Math.hypot(e.clientX-lp.x,e.clientY-lp.y)>10)cancelLP()});
document.addEventListener('pointerup',cancelLP);document.addEventListener('pointercancel',cancelLP);
document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-tile]'))e.preventDefault()});

/* ---------- eventos ---------- */
document.addEventListener('click',e=>{
  if(suppressClick&&e.target.closest('[data-tile]')){suppressClick=false;e.preventDefault();return}
  suppressClick=false;
  const t=e.target.closest('button,[data-act],label,[data-ticket],[data-tile]');if(!t)return;const d=t.dataset;
  if((d.act==='close-modal'||d.act==='close-order'||d.act==='close-scan')&&e.target!==t&&t.tagName!=='BUTTON')return;
  if(d.tile){addItem(d.tile);return}
  if(d.tab){S.tab=d.tab;S.confirm=null;S.orderOpen=false;window.scrollTo(0,0);render();return}
  if(d.add){addItem(d.add);return}
  if(d.dec){decItem(d.dec);return}
  if(d.cat){S.cat=d.cat;render();return}
  if(d.pay){if(d.pay==='cash')openTender();else finalize(d.pay);return}
  if(d.tend){t.parentNode.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===t));$('#tend-in').value='';setTender(+d.tend);return}
  if(d.range){S.range=+d.range;render();return}
  if(d.day){S.day=d.day;S.confirm=null;render();return}
  if(d.confirm){S.confirm=d.confirm;render();return}
  if(d.delsale){S.confirm=null;deleteSale(d.delsale);return}
  if(d.ticket){const s=S.sales.find(x=>x.id===d.ticket);if(s)openTicket(s,false);return}
  if(d.edit){openProduct(d.edit);return}
  if(d.entry){openEntry(d.entry);return}
  if(d.mpsale){saleFromMP(d.mpsale);return}
  switch(d.act){
    case 'theme':{const dk=document.documentElement.classList.toggle('dark');try{localStorage.setItem('cf-theme',dk?'dark':'light')}catch(e){}document.querySelector('meta[name="theme-color"]').content=dk?'#0D0D0D':'#F1F1F1';render();break}
    case 'search':S.searchOpen=!S.searchOpen;if(!S.searchOpen)S.search='';render();if(S.searchOpen){const i=$('#q');i.value=S.search;setTimeout(()=>i.focus(),30)}break;
    case 'search-clear':S.search='';S.searchOpen=false;render();break;
    case 'featured':S.featured=!S.featured;render();break;
    case 'scan':openScanner();break;
    case 'close-scan':closeScanner();break;
    case 'scan-again':{const b=$('#scanres');if(b)b.innerHTML='';if(scan)scan.busy=false;break}
    case 'scan-assign':{const pid=$('#scanpick').value;mem.products[pid].code=d.code;persist('products');sync();addItem(pid);toast('Código asignado a '+mem.products[pid].name);const b=$('#scanres');if(b)b.innerHTML='';if(scan)scan.busy=false;break}
    case 'open-order':S.orderOpen=true;render();break;
    case 'close-order':S.orderOpen=false;render();break;
    case 'clear-order':clearOrder();render();break;
    case 'confirm-cash':{const total=cartTotal();const v=tendered>0?tendered:total;$('#modal').innerHTML='';finalize('cash',v>=total?v:0);break}
    case 'close-modal':$('#modal').innerHTML='';currentTicket=null;tendered=0;break;
    case 'share-ticket':shareTicket();break;
    case 'share-text':shareText();break;
    case 'copy-ticket':copyTicket();break;
    case 'new-product':openProduct(null);break;
    case 'save-product':saveProduct(d.id||null);break;
    case 'save-entry':saveEntry(d.id);break;
    case 'rm-photo':draftPhoto=null;$('#p-th').innerHTML=thumb({cat:$('#p-cat').value});t.hidden=true;break;
    case 'del-product':if(t.dataset.armed){$('#modal').innerHTML='';remove('products',d.id).then(()=>toast('Producto borrado'))}else{t.dataset.armed='1';t.textContent='¿Seguro?'}break;
    case 'save-ticket':put('config','ticket',readTicketForm()).then(()=>toast('Ticket guardado'));break;
    case 'preview-ticket':{const old=S.config;S.config=[{id:'ticket',...readTicketForm()}];const ex={ts:Date.now(),folio:7,customer:'Maggie',method:'cash',received:200,items:[{name:'Brew Chai',qty:1,price:90},{name:'Pay',qty:1,price:50}],total:140};openTicket(ex,false).finally(()=>{S.config=old});break}
    case 'backup':exportBackup();break;
    case 'csv':exportSalesCSV();break;
    case 'clear-demo':if(t.dataset.armed){for(const k of Object.keys(mem.sales))if(mem.sales[k].demo)delete mem.sales[k];persist('sales');sync();render();toast('Ventas de prueba borradas')}else{t.dataset.armed='1';t.textContent='¿Seguro? Toca otra vez'}break;
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='cust')S.customer=e.target.value;
  if(e.target.id==='q'){S.search=e.target.value;$('#main').innerHTML=viewCaja()}
  if(e.target.id==='tend-in'){document.querySelectorAll('#tender button').forEach(b=>b.setAttribute('aria-pressed','false'));setTender(parseAmount(e.target.value)||0)}
});
document.addEventListener('change',e=>{
  if(e.target.id==='daypick'&&e.target.value){S.day=e.target.value;e.target.blur();render()}
  if(e.target.id==='mpfile'&&e.target.files[0]){importMP(e.target.files[0]);e.target.value=''}
  if(e.target.id==='restore'&&e.target.files[0]){importBackup(e.target.files[0]);e.target.value=''}
  if(e.target.id==='p-file'&&e.target.files[0]){loadPhoto(e.target.files[0]);e.target.value=''}
});
document.addEventListener('focusout',e=>{if(e.target.closest&&(e.target.closest('#main')||e.target.id==='cust'))setTimeout(()=>{const a=document.activeElement;if(!a||!(a.closest('#main')||a.id==='cust'))render()},0)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(scan)closeScanner();else $('#modal').innerHTML='';S.orderOpen=false;render()}});
matchMedia('(min-width:900px)').addEventListener('change',render);

/* ---------- arranque ---------- */
try{if(localStorage.getItem('cf-theme')==='dark'){document.documentElement.classList.add('dark');document.querySelector('meta[name="theme-color"]').content='#0D0D0D'}}catch(e){}
render();
(async()=>{
  await loadAll();await seedIfEmpty();sync();S.ready=true;render();
  if('serviceWorker' in navigator&&location.protocol==='https:'){try{navigator.serviceWorker.register('sw.js')}catch(e){}}
})();
})();
