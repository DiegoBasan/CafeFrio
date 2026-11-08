(function(){
'use strict';
const DAY=86400000;
const CATS={cold:{label:'Cold brew',ph:'ph-cold'},foam:{label:'Cold foam',ph:'ph-foam'},pay:{label:'Pay',ph:'ph-pay'},hot:{label:'Caliente',ph:'ph-hot'}};
const METHODS={cash:{label:'Efectivo',icon:'i-cash',color:'var(--ink)'},card:{label:'Tarjeta',icon:'i-card',color:'var(--accent)'},transfer:{label:'Transferencia',icon:'i-transfer',color:'var(--ink3)'},gift:{label:'Cortesía',icon:'i-gift',color:'var(--line)'}};
const METHOD_LABEL=m=>m==='mixed'?'Mixto':m==='mp'?'Tarjeta':(METHODS[m]?.label||m);
// cuánto se cobró por cada forma de pago en una venta (las mixtas se reparten)
function paidBy(s){const m=s.method==='mp'?'card':s.method;if(m==='mixed'&&Array.isArray(s.payments))return s.payments.map(p=>[p.method,+p.amount||0]);return [[m,+s.total||0]]}
const DISC=[0,10,15,20];const TIPS=[0,10,15];
const TABS=[['caja','Caja','i-caja'],['barra','Barra','i-prep'],['ventas','Ventas','i-receipt'],['menu','Menú','i-box'],['numeros','Números','i-chart'],['mp','M. Pago','i-mp']];
const DEF_TICKET={title:'Café Frío',subtitle:'Cold brew · Chihuahua',footer:'¡Gracias por tu visita! Nos vemos en la combi.',ig:'@somoscafefrio',showLogo:true,showQR:true};
const COLS=['products','sales','entries','mp','config','cortes','held'];

const S={products:[],sales:[],entries:[],mp:[],config:[],cortes:[],held:[],animOrder:false,tab:'caja',cat:'all',cart:{},order:[],customer:'',range:7,day:dayKey(Date.now()),
  orderOpen:false,ready:false,disc:0,tip:0,adjOpen:false,confirm:null,busy:false,search:'',searchOpen:false,featured:false};

/* ---------- utils ---------- */
const $=(s,r=document)=>r.querySelector(s);
const BP='(min-width:740px)';
const wide=()=>matchMedia(BP).matches;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(n){n=Math.round((+n||0)*100)/100;const int=Number.isInteger(n);return '$'+n.toLocaleString('es-MX',{minimumFractionDigits:int?0:2,maximumFractionDigits:2})}
function dayKey(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function startOfDay(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime()}
function hhmm(ts){return new Date(ts).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false})}
function longDate(ts){const t=new Date(ts).toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});return t.charAt(0).toUpperCase()+t.slice(1)}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function icon(id,size=22){return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`}
function thumb(p){return p&&p.photo?`<img src="${esc(p.photo)}" alt="" draggable="false" decoding="async">`:`<svg viewBox="0 0 120 120" aria-hidden="true"><use href="#${CATS[p&&p.cat]?.ph||'ph-cold'}"/></svg>`}
let toastT;function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2400)}
function buzz(ms){try{navigator.vibrate&&navigator.vibrate(ms)}catch(e){}}
const prodById=id=>S.products.find(p=>p.id===id);
const sortedProducts=()=>[...S.products].sort((a,b)=>(a.order??999)-(b.order??999)||String(a.name).localeCompare(b.name));
const ticketCfg=()=>Object.assign({},DEF_TICKET,(S.config.find(c=>c.id==='ticket')||{}));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

/* ---------- almacenamiento en el dispositivo (IndexedDB, con respaldo en localStorage) ---------- */
let mem={products:{},sales:{},entries:{},mp:{},config:{},cortes:{},held:{}};
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
const SEED_MORE=[
  ['p-cbmoka','Cold brew moka','cold',85,24,null,4,'img/cold-brew-vainilla.jpg',false],
  ['p-cbcan','Cold brew canela','cold',80,22,null,5,'img/cold-brew-clasico.jpg',false],
  ['p-cb1l','Cold brew 1 litro','cold',220,60,10,6,'img/cold-brew-horchata.jpg',false],
  ['p-foamva','Cold foam vainilla','foam',90,26,null,9,'img/brew-chai.jpg',false],
  ['p-foamcar','Cold foam caramelo','foam',95,28,null,10,'img/apple-crunch.jpg',false],
  ['p-cap','Capuchino','hot',55,14,null,13,'img/latte.jpg',false],
  ['p-moka','Mocha','hot',65,18,null,14,'img/americano.jpg',false],
  ['p-chai','Chai latte','hot',65,17,null,15,'img/latte.jpg',false],
  ['p-choco','Chocolate caliente','hot',55,15,null,16,'img/americano.jpg',false]
];
async function migrate(){
  const v=mem.config.meta?.seedv||1;if(v>=2)return;
  for(const [id,name,cat,price,cost,stock,order,photo,featured] of SEED_MORE)if(!mem.products[id])mem.products[id]={name,cat,price,cost,stock,order,photo,featured,active:true,demo:true};
  for(const s of Object.values(mem.sales))if(s.method==='mp')s.method='card';
  const maxF=Object.values(mem.sales).reduce((m,s)=>Math.max(m,+s.folio||0),0);
  mem.config.meta={...(mem.config.meta||{}),seedv:2,seq:Math.max(mem.config.meta?.seq||0,128,maxF)};
  for(const c of ['products','sales','config'])await persist(c);
}
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
  rows.forEach((row,i)=>{const k=dayKey(row.ts);folios[k]=(folios[k]||0)+1;const total=row.items.reduce((s,x)=>s+x.qty*x.price,0);const m=rnd()<.5?'cash':rnd()<.8?'card':'transfer';
    mem.sales['demo-'+i]={...row,subtotal:total,total,method:m,folio:i+1,demo:true,...(m==='cash'?{received:[100,200,500].find(b=>b>=total)||total}:{})}});
  for(const c of ['products','sales'])await persist(c);
}

/* ---------- orden ---------- */
function addItem(pid){const p=prodById(pid);if(!p)return;if(!S.cart[pid])S.order.push(pid);S.cart[pid]=(S.cart[pid]||0)+1;buzz(8);refreshCart()}
function decItem(pid){S.cart[pid]=(S.cart[pid]||0)-1;if(S.cart[pid]<=0){delete S.cart[pid];S.order=S.order.filter(x=>x!==pid)}refreshCart()}
function dropItem(pid){if(!S.cart[pid])return;const n=prodById(pid)?.name||'';delete S.cart[pid];S.order=S.order.filter(x=>x!==pid);buzz(25);toast('Quitado: '+n);refreshCart()}
function cartItems(){return S.order.map(pid=>{const p=prodById(pid);const q=S.cart[pid];return p&&q>0?{pid,name:p.name,qty:q,price:+p.price||0,cost:+p.cost||0}:null}).filter(Boolean)}
function cartSubtotal(){return cartItems().reduce((s,i)=>s+i.qty*i.price,0)}
function cartCalc(){const sub=cartSubtotal();const discount=Math.round(sub*S.disc)/100;const base=sub-discount;const tip=Math.round(base*S.tip)/100;return {sub,discount,tip,total:base+tip}}
function cartTotal(){return cartCalc().total}
function clearOrder(){S.cart={};S.order=[];S.customer='';S.orderOpen=false;S.disc=0;S.tip=0;S.adjOpen=false;const c=$('#cust');if(c)c.value=''}
function nextFolio(){return (mem.config.meta?.seq||0)+1}
const folioStr=f=>'#'+String(f||0).padStart(4,'0');
async function finalize(method,received,payments){
  const items=cartItems();if(!items.length||S.busy)return;
  S.busy=true;
  const c0=cartCalc();
  const gift=method==='gift';
  const total=gift?0:c0.total;
  const folio=nextFolio();mem.config.meta={...(mem.config.meta||{}),seq:folio};await persist('config');
  const sale={ts:Date.now(),items,subtotal:c0.sub,total,method,folio};
  if(gift)sale.discount=c0.sub;else{if(c0.discount)sale.discount=c0.discount,sale.discPct=S.disc;if(c0.tip)sale.tip=c0.tip,sale.tipPct=S.tip}
  if(payments)sale.payments=payments;
  sale.prep='pending';
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
let pengImg=null;
async function getPeng(){if(pengImg)return pengImg;const d=$('#peng-path').getAttribute('d');const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="330 0 430 500" width="860" height="1000"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`);try{await img.decode()}catch(e){await new Promise(r=>{img.onload=r;img.onerror=r})}pengImg=img;return img}
function logoSVG(color){const d=$('#logo-path').getAttribute('d');return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1115 527" width="1115" height="527"><path fill="${color}" fill-rule="evenodd" d="${d}"/></svg>`}
async function getLogo(){if(logoImg)return logoImg;const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(logoSVG('#111111'));try{await img.decode()}catch(e){await new Promise(r=>{img.onload=r;img.onerror=r})}logoImg=img;return img}
function wrap(ctx,text,maxW){const words=String(text).split(/\s+/);const lines=[];let cur='';for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t}if(cur)lines.push(cur);return lines}
// El ticket se genera a lo mucho 3:4 (alto:ancho 1.33) para que WhatsApp lo muestre completo.
// Si la orden es muy larga, el papel se hace más ancho y el texto se queda centrado.
const TICKET_MAX_RATIO=1.33;
async function drawTicket(sale){
  const cfg=ticketCfg();
  try{await document.fonts.load('600 20px "IBM Plex Mono"');await document.fonts.load('400 20px "IBM Plex Mono"')}catch(e){}
  const CW=496,K=2;const mono='"IBM Plex Mono",Menlo,monospace';
  let W=576;
  const logo=cfg.showLogo?await getLogo():null;const peng=await getPeng();
  let qr=null;
  if(cfg.ig&&cfg.showQR&&window.qrcode){try{const q=window.qrcode(0,'M');q.addData('https://instagram.com/'+cfg.ig.replace(/^@/,'').trim());q.make();qr=q}catch(e){}}
  let Hfinal=0;
  const run=(ctx)=>{
    const L=(W-CW)/2,R=L+CW,C=W/2;let y=38;
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,4000);
    if(Hfinal&&peng){ctx.save();ctx.globalAlpha=.04;const ph=Math.min(Hfinal*.82,900),pw=ph*430/500;ctx.translate(C+CW*.08,Hfinal*.55);ctx.rotate(-.12);try{ctx.drawImage(peng,-pw/2,-ph/2,pw,ph)}catch(e){}ctx.restore()}
    ctx.fillStyle='#111111';ctx.textBaseline='alphabetic';
    if(logo){const lw=330,lh=lw*527/1115;try{ctx.drawImage(logo,C-lw/2,y,lw,lh)}catch(e){}y+=lh+16}
    else if(cfg.title){ctx.font=`600 34px ${mono}`;ctx.textAlign='center';ctx.fillText(cfg.title,C,y+30);y+=48}
    ctx.textAlign='center';
    if(cfg.subtitle){ctx.font=`400 18px ${mono}`;for(const l of wrap(ctx,cfg.subtitle,CW)){ctx.fillText(l,C,y+16);y+=24}}
    y+=8;ctx.font=`400 17px ${mono}`;ctx.fillStyle='#444';
    const ds=new Date(sale.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})+' · '+hhmm(sale.ts);
    ctx.textAlign='left';ctx.fillText(ds,L,y+16);ctx.textAlign='right';ctx.fillText('Folio '+folioStr(sale.folio),R,y+16);y+=26;
    if(sale.customer){ctx.textAlign='left';ctx.fillStyle='#111';ctx.font=`600 21px ${mono}`;ctx.fillText('Para: '+sale.customer,L,y+21);y+=30}
    const dash=()=>{y+=8;ctx.strokeStyle='#999';ctx.setLineDash([6,6]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.setLineDash([]);y+=18};
    dash();ctx.fillStyle='#111';
    for(const it of sale.items||[]){
      ctx.font=`400 19px ${mono}`;const amt=money(it.qty*it.price);ctx.textAlign='right';const aw=ctx.measureText(amt).width;
      ctx.fillText(amt,R,y+19);ctx.textAlign='left';
      for(const l of wrap(ctx,(it.qty>1?it.qty+'× ':'')+it.name,CW-aw-20)){ctx.fillText(l,L,y+19);y+=26}
      y+=2;
    }
    dash();
    if(sale.discount||sale.tip){const sub=sale.subtotal??(sale.items||[]).reduce((a,i)=>a+i.qty*i.price,0);
      const kv0=(k,v)=>{ctx.font=`400 18px ${mono}`;ctx.fillStyle='#444';ctx.textAlign='left';ctx.fillText(k,L,y+17);ctx.textAlign='right';ctx.fillText(v,R,y+17);y+=25};
      kv0('Subtotal',money(sub));if(sale.discount)kv0(sale.method==='gift'?'Cortesía':'Descuento','−'+money(sale.discount));if(sale.tip)kv0('Propina',money(sale.tip));y+=4}
    ctx.fillStyle='#111';ctx.font=`600 29px ${mono}`;ctx.textAlign='left';ctx.fillText('TOTAL',L,y+27);ctx.textAlign='right';ctx.fillText(money(sale.total),R,y+27);y+=40;
    ctx.font=`400 17px ${mono}`;ctx.fillStyle='#444';
    const kv=(k,v)=>{ctx.textAlign='left';ctx.fillText(k,L,y+16);ctx.textAlign='right';ctx.fillText(v,R,y+16);y+=24};
    if(sale.method==='mixed'&&sale.payments)sale.payments.forEach(p=>kv(METHOD_LABEL(p.method),money(p.amount)));else kv('Pago',METHOD_LABEL(sale.method));
    if(sale.received){kv('Recibido',money(sale.received));kv('Cambio',money(sale.received-sale.total))}
    dash();
    if(qr){
      // QR a la izquierda, mensaje y @ a la derecha: ocupa menos alto
      const size=124,n=qr.getModuleCount(),cell=size/n,y0=y+2;
      ctx.fillStyle='#fff';ctx.fillRect(L-4,y0-4,size+8,size+8);ctx.fillStyle='#111';
      for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))ctx.fillRect(L+c*cell,y0+r*cell,Math.ceil(cell),Math.ceil(cell));
      const tx=L+size+22,tw=R-tx;let ty=y0+4;ctx.textAlign='left';
      if(cfg.footer){ctx.font=`400 17px ${mono}`;ctx.fillStyle='#111';for(const l of wrap(ctx,cfg.footer,tw)){ctx.fillText(l,tx,ty+16);ty+=23}}
      ty+=8;ctx.font=`400 15px ${mono}`;ctx.fillStyle='#666';ctx.fillText('Escanea y síguenos',tx,ty+14);ty+=22;
      ctx.font=`600 19px ${mono}`;ctx.fillStyle='#111';ctx.fillText(cfg.ig,tx,ty+17);ty+=26;
      y=Math.max(y0+size,ty)+8;
    }else{
      ctx.fillStyle='#111';ctx.textAlign='center';
      if(cfg.footer){ctx.font=`400 18px ${mono}`;for(const l of wrap(ctx,cfg.footer,CW)){ctx.fillText(l,C,y+17);y+=25}}
      if(cfg.ig){ctx.font=`600 19px ${mono}`;y+=4;ctx.fillText(cfg.ig,C,y+17);y+=26}
    }
    return y+30;
  };
  const probe=document.createElement('canvas');probe.width=W;probe.height=4000;
  let H=Math.ceil(run(probe.getContext('2d')))+12;
  if(H/W>TICKET_MAX_RATIO)W=Math.ceil(H/TICKET_MAX_RATIO);
  Hfinal=H;
  const c=document.createElement('canvas');c.width=W*K;c.height=H*K;const ctx=c.getContext('2d');ctx.scale(K,K);run(ctx);
  // borde de papel cortado abajo
  ctx.globalCompositeOperation='destination-out';ctx.beginPath();
  const step=W/Math.round(W/16);for(let x=0;x<W-0.5;x+=step){ctx.moveTo(x,H);ctx.lineTo(x+step/2,H-10);ctx.lineTo(x+step,H)}
  ctx.fill();ctx.globalCompositeOperation='source-over';
  return c;
}
function ticketText(s){
  const cfg=ticketCfg();const L=[];
  L.push(cfg.title||'Café Frío');if(cfg.subtitle)L.push(cfg.subtitle);
  L.push(new Date(s.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})+' '+hhmm(s.ts)+' · Folio '+folioStr(s.folio));
  if(s.customer)L.push('Para: '+s.customer);
  L.push('—');(s.items||[]).forEach(i=>L.push((i.qty>1?i.qty+'× ':'')+i.name+'  '+money(i.qty*i.price)));
  L.push('—');L.push('TOTAL '+money(s.total)+' · '+METHOD_LABEL(s.method));
  if(s.received)L.push('Recibido '+money(s.received)+' · Cambio '+money(s.received-s.total));
  if(cfg.footer)L.push(cfg.footer);if(cfg.ig)L.push(cfg.ig);
  return L.join('\n');
}
let currentTicket=null;
function ticketName(s){const d=new Date(s.ts);const p=n=>String(n).padStart(2,'0');return `CafeFrio ${p(d.getDate())}-${p(d.getMonth()+1)}-${String(d.getFullYear()).slice(2)} ${folioStr(s.folio)}`}
// Muestra el ticket con su sombra dibujada dentro de la imagen (Safari pinta mal las sombras CSS al animar)
// y lo "imprime" deslizándolo desde la ranura cada vez que se abre.
let printUrl=null;
async function showPrinted(c){
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));
  if(printUrl)URL.revokeObjectURL(printUrl);printUrl=URL.createObjectURL(blob);
  const w=$('#tkwrap');if(!w||!document.body.contains(w))return;
  const img=new Image();img.alt='Ticket de la venta';img.src=printUrl;
  w.replaceChildren(img);
}
async function openTicket(sale,fresh){
  let resolveBlob;const openedAt=Date.now();currentTicket={sale,file:null,blobP:new Promise(r=>resolveBlob=r)};
  const fol=folioStr(sale.folio).slice(1);
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><div class="sheet ticketsheet" role="dialog" aria-label="Ticket">
    ${fresh?`<div class="done"><span class="ok">${icon('i-check',22)}</span><div><div style="font-weight:700;font-size:18px">Cobrado ${money(sale.total)}</div><div class="sub">${METHOD_LABEL(sale.method)}${sale.received?' · cambio '+money(sale.received-sale.total):''} · folio #${fol}</div></div></div>`:`<h2>Ticket #${fol}</h2>`}
    <div class="ticketwrap" id="tkwrap"><div class="gen">Generando ticket…</div></div>
    <div class="sharegrid">
      <button class="btn ink wide" data-act="share-ticket">${icon('i-share',20)} Compartir</button>
      <button class="btn ghost" data-act="save-ticket-img">${icon('i-save',18)} Guardar</button>
      <button class="btn ghost" data-act="copy-image">${icon('i-copy',18)} Copiar imagen</button>
    </div>
    <button class="btn primary" style="padding:16px;font-size:17px" data-act="${fresh?'new-order':'close-modal'}">${fresh?'Nueva orden':'Cerrar'}</button>
  </div></div>`;
  try{
    const c=await drawTicket(sale);
    if(!currentTicket||currentTicket.sale!==sale)return;
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    resolveBlob(blob);currentTicket.file=new File([blob],ticketName(sale)+'.png',{type:'image/png'});
    await showPrinted(c);
  }catch(e){const w=$('#tkwrap');if(w)w.innerHTML=`<pre class="sel mono" style="white-space:pre-wrap;font-size:13px;margin:0">${esc(ticketText(sale))}</pre>`}
}
async function shareTicket(){
  if(!currentTicket)return;
  const f=currentTicket.file;
  try{
    if(!f){toast('Espera a que termine el ticket');return}
    if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:ticketName(currentTicket.sale)});return}
  }catch(e){if(e&&e.name==='AbortError')return}
  saveTicketImg();
}
async function saveFile(f,hint){
  if(!f){toast('Espera a que termine de generarse');return}
  try{if(navigator.canShare&&navigator.canShare({files:[f]})){toast(hint);await navigator.share({files:[f]});return}}catch(e){if(e&&e.name==='AbortError')return}
  const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove();toast('Descargado: '+f.name);
}
function saveTicketImg(){saveFile(currentTicket&&currentTicket.file,'Elige “Guardar imagen” para mandarlo a Fotos')}
function copyImage(){
  if(!currentTicket)return;
  try{
    if(!window.ClipboardItem||!navigator.clipboard?.write)throw 0;
    navigator.clipboard.write([new ClipboardItem({'image/png':currentTicket.blobP})]).then(()=>toast('Imagen copiada: pégala en el chat'),()=>toast('No se pudo copiar la imagen'));
  }catch(e){toast('Este navegador no deja copiar imágenes; usa Compartir')}
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
  const mpSales=S.sales.filter(s=>['card','transfer','mp','mixed'].includes(s.method));const used=new Set();const match={};
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
  await put('sales',uid(),{ts:m.ts,items:[{pid:'',name:'Cobro Mercado Pago',qty:1,price:m.amount,cost:0}],subtotal:m.amount,total:m.amount,method:'card',mpRef:m.id,folio:0});toast('Venta registrada')}

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
  const rows=[['fecha','hora','folio','cliente','productos','subtotal','descuento','propina','total','pago']];
  [...S.sales].sort((a,b)=>a.ts-b.ts).forEach(s=>rows.push([dayKey(s.ts),hhmm(s.ts),folioStr(s.folio),s.customer||'',(s.items||[]).map(i=>i.qty+'x '+i.name).join(' + '),s.subtotal??s.total,s.discount||0,s.tip||0,s.total,s.method==='mixed'&&s.payments?s.payments.map(p=>METHOD_LABEL(p.method)+' '+p.amount).join(' + '):METHOD_LABEL(s.method)]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const f=new File(['﻿'+csv],`ventas-cafe-frio-${dayKey(Date.now())}.csv`,{type:'text/csv'});
  (async()=>{try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove()})();
}

/* ---------- render ---------- */
function navHTML(){return TABS.filter(([k])=>k!=='barra'||wide()).map(([k,l,i])=>`<button class="navbtn" data-tab="${k}" ${S.tab===k?'aria-current="page"':''}>${icon(i,24)}<span>${l}</span></button>`).join('')}
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
  if(!wide()&&S.tab==='barra')S.tab='caja';
  if(!typing)$('#main').innerHTML=({caja:viewCaja,barra:viewBarra,ventas:viewSales,menu:viewMenu,numeros:viewStats,mp:viewMP})[S.tab]();
  renderOrder();
}
function viewCaja(){
  const all=sortedProducts().filter(p=>p.active!==false&&p.today!==false);
  const cats=Object.keys(CATS).filter(c=>all.some(p=>p.cat===c));
  const q=norm(S.search.trim());
  const ps=all.filter(p=>(S.cat==='all'||p.cat===S.cat)&&(!S.featured||p.featured)&&(!q||norm(p.name).includes(q)));
  let body;
  if(!S.ready)body=`<div class="empty">Cargando el menú…</div>`;
  else if(!all.length)body=`<div class="empty"><div><b>No hay productos para hoy.</b><br>En Menú → Menú de hoy elige qué tienen disponible y aparecerá aquí.</div></div>`;
  else if(!ps.length)body=`<div class="empty">${S.featured?'No hay productos destacados con este filtro. Marca la estrella en Menú para destacarlos.':'Ningún producto coincide con la búsqueda.'}</div>`;
  else body=`<div class="grid">${ps.map(p=>{const n=S.cart[p.id]||0;const hasS=typeof p.stock==='number';const out=hasS&&p.stock<=0;
    return `<button class="tile ${n?'on':''} ${out?'out':''}" data-tile="${p.id}" aria-label="Agregar ${esc(p.name)}"><span class="ph">${thumb(p)}</span><span class="meta"><span class="tn">${esc(p.name)}</span><span class="tp num">${money(p.price)}</span></span>${n?`<span class="q">${n}</span>`:''}${hasS?`<span class="stk ${p.stock<=5?'low':''}">${p.stock}</span>`:''}</button>`}).join('')}</div>
    <div class="hint" id="lphint" ${S.order.length?'':'hidden'}>Mantén presionado un producto para quitarlo de la orden.</div>`;
  return `<div class="section">
    ${heldBar()}
    <div class="chips" role="group" aria-label="Categorías">
      <button class="chip" data-cat="all" aria-pressed="${S.cat==='all'}">Todo</button>
      ${cats.map(c=>`<button class="chip" data-cat="${c}" aria-pressed="${S.cat===c}">${CATS[c].label}<span class="c">${all.filter(p=>p.cat===c).length}</span></button>`).join('')}
    </div>
    ${body}
  </div>`;
}
const EMPTY_ORDER=`<div class="empty-o"><svg class="logo peng" viewBox="330 0 430 500" aria-hidden="true"><use href="#peng"/></svg><div>Toca un producto para empezar la orden.</div></div>`;
function orderShell(W){return `${!W?`<div class="scrim" data-act="close-order"></div>`:''}<aside class="order${S.animOrder?' enter':''}" aria-label="Orden actual">
    ${!W?`<span class="grab"></span>`:''}
    <div class="oh"><h2 id="o-title">Orden</h2><span class="f" id="o-folio"></span></div>
    <div class="lines" id="o-lines"></div>
    <div class="of">
      <input id="cust" class="cust" placeholder="Nombre del cliente (opcional)" autocomplete="off" maxlength="40">
      <div class="tot"><span class="l">Total</span><span class="v num" id="o-total"></span></div>
      <div class="pay">
        <button class="main" data-pay="cash">${icon('i-cash',22)} Efectivo</button>
        <button data-pay="card">${icon('i-card',20)} Tarjeta</button>
        <button data-pay="transfer">${icon('i-transfer',20)} Transferencia</button>
      </div>
      <div class="ofoot">
        <button class="btn ghost holdbtn tablet-only" data-act="hold" id="o-hold">${icon('i-pause',18)} Poner en espera</button>
        <button class="linkbtn" data-act="clear-order" id="o-clear">Cancelar orden</button>
      </div>
    </div>
  </aside>`}
function renderOrder(){
  const host=$('#orderhost'),bar=$('#obar');
  if(S.tab!=='caja'){host.innerHTML='';host.dataset.mode='';bar.hidden=true;return}
  const items=cartItems(),total=cartTotal(),n=items.reduce((s,i)=>s+i.qty,0);
  const W=wide();
  bar.hidden=W||!n||S.orderOpen;
  if(!bar.firstChild)bar.innerHTML=`<button data-act="open-order"><span class="cnt" id="b-cnt"></span><span class="sp">Ver orden</span><span class="t num" id="b-tot"></span></button>`;
  $('#b-cnt').textContent=n;$('#b-tot').textContent=money(total);
  if(!W&&!S.orderOpen){host.innerHTML='';host.dataset.mode='';return}
  const mode=W?'side':'sheet';
  if(host.dataset.mode!==mode){host.innerHTML=orderShell(W);host.dataset.mode=mode;S.animOrder=false}
  $('#o-title').textContent='Orden'+(n?' · '+n:'');
  $('#o-folio').textContent='Folio '+folioStr(nextFolio());
  const cust=$('#cust');if(document.activeElement!==cust&&cust.value!==S.customer)cust.value=S.customer;
  $('#o-total').textContent=money(total);
  host.querySelectorAll('[data-pay]').forEach(b=>b.disabled=!items.length||S.busy);
  $('#o-clear').hidden=!items.length;$('#o-hold').hidden=!items.length;
  const box=$('#o-lines');
  if(!items.length){if(!box.querySelector('.empty-o'))box.innerHTML=EMPTY_ORDER;return}
  const em=box.querySelector('.empty-o');if(em)em.remove();
  const seen=new Set();
  items.forEach((i,idx)=>{
    let el=box.querySelector(`[data-line="${i.pid}"]`);
    if(!el){el=document.createElement('div');el.className='oline enter';el.dataset.line=i.pid;
      el.innerHTML=`<span class="th">${thumb(prodById(i.pid))}</span><div style="min-width:0"><div class="n"></div><div class="p num"></div></div><span class="step"><button data-dec="${i.pid}" aria-label="Quitar uno">−</button><span class="qv"></span><button data-add="${i.pid}" aria-label="Agregar uno">+</button></span>`}
    el.querySelector('.n').textContent=i.name;
    el.querySelector('.p').textContent=money(i.price)+(i.qty>1?' · '+money(i.qty*i.price):'');
    el.querySelector('.qv').textContent=i.qty;
    if(box.children[idx]!==el)box.insertBefore(el,box.children[idx]||null);
    seen.add(i.pid);
  });
  box.querySelectorAll('[data-line]').forEach(el=>{if(!seen.has(el.dataset.line))el.remove()});
}
// actualiza solo lo que cambió al tocar un producto (sin volver a dibujar la pantalla)
function refreshCart(){
  if(S.tab!=='caja'){render();return}
  document.querySelectorAll('#main [data-tile]').forEach(t=>{
    const n=S.cart[t.dataset.tile]||0;t.classList.toggle('on',!!n);let q=t.querySelector('.q');
    if(n){if(!q){q=document.createElement('span');q.className='q';t.appendChild(q)}
      if(q.textContent!==String(n)){q.textContent=n;q.classList.remove('pop');void q.offsetWidth;q.classList.add('pop')}}
    else if(q)q.remove();
  });
  const h=$('#lphint');if(h)h.hidden=!S.order.length;
  renderOrder();
}
function closeOrderSheet(){
  const o=$('#orderhost .order');if(!o||wide()){S.orderOpen=false;render();return}
  o.classList.add('leave');const sc=$('#orderhost .scrim');if(sc)sc.classList.add('leave');
  setTimeout(()=>{S.orderOpen=false;renderOrder()},200);
}
function resetModal(){
  const old=$('#modal');const n=document.createElement('div');n.id='modal';old.replaceWith(n);
}
function closeModal(newOrder){
  currentTicket=null;tendered=0;
  const m=$('#modal .modal');
  const done=()=>{resetModal();if(newOrder){clearOrder();S.orderOpen=false;S.cat='all';window.scrollTo(0,0);render()}};
  if(!m){done();return}
  m.classList.add('leave');setTimeout(done,190);
}

/* ---------- órdenes en espera (tablet) ---------- */
async function holdOrder(){
  if(!cartItems().length)return;const id=uid();
  const name=S.customer.trim()||('Orden '+(S.held.length+1));
  mem.held[id]={ts:Date.now(),name,named:!!S.customer.trim(),cart:{...S.cart},order:[...S.order]};
  await persist('held');clearOrder();sync();render();toast('En espera: '+name);
}
async function resumeHeld(id){
  const h=mem.held[id];if(!h)return;
  if(cartItems().length)await holdOrder();
  S.cart={...h.cart};S.order=h.order.filter(pid=>prodById(pid));S.customer=h.named?h.name:'';
  delete mem.held[id];await persist('held');sync();render();toast('Retomada: '+h.name);
}
function heldBar(){
  if(!wide()||!S.held.length)return '';
  const list=[...S.held].sort((a,b)=>a.ts-b.ts);
  return `<div class="heldbar"><span class="l">${icon('i-pause',16)} En espera</span>${list.map(h=>{const n=Object.values(h.cart).reduce((a,b)=>a+b,0);const t=Object.entries(h.cart).reduce((a,[pid,q])=>a+(+(prodById(pid)?.price)||0)*q,0);const m=Math.floor((Date.now()-h.ts)/60000);
    return `<button class="heldchip" data-held="${h.id}"><b>${esc(h.name)}</b><span class="num">${n} · ${money(t)}</span><span class="ago">${m<1?'ahora':m+' min'}</span></button>`}).join('')}</div>`;
}

/* ---------- barra: órdenes por preparar (tablet) ---------- */
function viewBarra(){
  const pend=S.sales.filter(s=>s.prep==='pending').sort((a,b)=>a.ts-b.ts);
  const done=S.sales.filter(s=>s.prep==='done').sort((a,b)=>(b.doneTs||0)-(a.doneTs||0)).slice(0,8);
  return `<div class="section">
    <div class="row" style="align-items:center"><div><h1 class="h1">Barra</h1><div class="sub">${pend.length?pend.length+(pend.length===1?' orden':' órdenes')+' por preparar':'Todo al día'}</div></div></div>
    ${pend.length?`<div class="prepgrid">${pend.map(prepCard).join('')}</div>`:`<div class="empty"><svg class="peng" viewBox="330 0 430 500" width="56" height="65" aria-hidden="true" style="color:var(--ink3)"><use href="#peng"/></svg><div>No hay órdenes por preparar. Cada cobro aparece aquí con su folio y nombre.</div></div>`}
    ${done.length?`<div class="panel"><h3>Entregadas</h3><div class="list">${done.map(s=>`<div class="item"><span class="time">${folioStr(s.folio)}</span><div style="min-width:0"><div class="t1">${s.customer?esc(s.customer)+' · ':''}${esc((s.items||[]).map(i=>(i.qty>1?i.qty+'× ':'')+i.name).join(', '))}</div><div class="t2">Lista a las ${hhmm(s.doneTs||s.ts)}</div></div><button class="btn ghost" style="padding:8px 12px;font-size:13px" data-undo="${s.id}">Regresar</button></div>`).join('')}</div></div>`:''}
  </div>`;
}
function prepCard(s){
  const m=Math.floor((Date.now()-s.ts)/60000);
  return `<div class="prep ${m>=8?'late':''}" data-prep="${s.id}">
    <div class="ph"><b class="mono">${folioStr(s.folio)}</b><span class="ago">${m<1?'ahora':m+' min'}</span></div>
    ${s.customer?`<div class="who">${esc(s.customer)}</div>`:''}
    <ul>${(s.items||[]).map(i=>`<li><span class="qn">${i.qty}</span>${esc(i.name)}</li>`).join('')}</ul>
    <button class="btn primary" data-ready="${s.id}">${icon('i-check',18)} Lista</button>
  </div>`;
}
async function markReady(id){
  const card=document.querySelector(`[data-prep="${id}"]`);if(card)card.classList.add('leave');
  setTimeout(async()=>{const s=mem.sales[id];if(!s)return;s.prep='done';s.doneTs=Date.now();await persist('sales');sync();render()},200);
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
function openMixed(){
  const total=cartTotal();if(!total)return;
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><div class="sheet" role="dialog" aria-label="Pago mixto">
    <h2>Pago mixto</h2>
    <div class="bigtot num">${money(total)}</div>
    <div class="row"><div class="field"><label for="mx-cash">En efectivo</label><input id="mx-cash" inputmode="decimal" placeholder="$0"></div>
    <div class="field"><label for="mx-other">El resto con</label><select id="mx-other"><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></select></div></div>
    <div class="changebox" id="mx-rest">Escribe cuánto pagan en efectivo</div>
    <button class="btn primary" style="padding:16px;font-size:17px" data-act="confirm-mixed" id="mxgo" disabled>Cobrar ${money(total)}</button>
  </div></div>`;
}
function updMixed(){const total=cartTotal();const c=Math.min(parseAmount($('#mx-cash').value)||0,total);const r=total-c;const lbl=$('#mx-other').selectedOptions[0].textContent;
  $('#mx-rest').innerHTML=c>0?`Efectivo <b class="num">${money(c)}</b> · ${lbl} <b class="num">${money(r)}</b>`:'Escribe cuánto pagan en efectivo';$('#mxgo').disabled=!(c>0&&r>0)}
function openGift(){
  const sub=cartSubtotal();
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><div class="sheet" role="dialog" aria-label="Cortesía">
    <h2>Cortesía</h2><div class="sub">La orden se registra en $0. El costo de los productos se cuenta en Números para que sepan cuánto regalan.</div>
    <div class="bigtot num">${money(sub)} → $0</div>
    <button class="btn primary" style="padding:16px;font-size:17px" data-act="confirm-gift">Registrar cortesía</button>
  </div></div>`;
}
let tendered=0;
function setTender(v){tendered=v;const total=cartTotal();const c=$('#chg');if(!c)return;
  if(!(v>0)){c.textContent='Elige cuánto te dieron';$('#cashgo').disabled=false;return}
  c.innerHTML=v>=total?`Cambio <b class="num">${money(v-total)}</b>`:`Faltan <b class="num">${money(total-v)}</b>`;
  $('#cashgo').disabled=v<total}

/* ---------- corte de caja ---------- */
function dayStats(d0){
  const list=S.sales.filter(s=>s.ts>=d0&&s.ts<d0+DAY);const by={cash:0,card:0,transfer:0};
  list.forEach(s=>paidBy(s).forEach(([m,a])=>{if(m in by)by[m]+=a}));
  return {list,by,total:list.reduce((a,s)=>a+s.total,0),tips:list.reduce((a,s)=>a+(+s.tip||0),0),disc:list.filter(s=>s.method!=='gift').reduce((a,s)=>a+(+s.discount||0),0),
    gifts:list.filter(s=>s.method==='gift'),orders:list.filter(s=>s.method!=='gift').length};
}
function lastFondo(){const c=[...S.cortes].sort((a,b)=>b.ts-a.ts)[0];return c?c.fondo:500}
function openCorte(){
  const d0=new Date(S.day+'T00:00:00').getTime();const st=dayStats(d0);const prev=mem.cortes[S.day];
  const fondo=prev?prev.fondo:lastFondo();
  $('#modal').innerHTML=`<div class="modal" data-act="close-modal"><div class="sheet" role="dialog" aria-label="Corte de caja">
    <h2>Corte de caja</h2><div class="sub">${esc(longDate(d0))} · ${st.orders} órdenes</div>
    <div class="cortebox">
      <div><span>Efectivo</span><b class="num">${money(st.by.cash)}</b></div>
      <div><span>Tarjeta</span><b class="num">${money(st.by.card)}</b></div>
      <div><span>Transferencia</span><b class="num">${money(st.by.transfer)}</b></div>
      ${st.tips?`<div><span>Propinas (incluidas)</span><b class="num">${money(st.tips)}</b></div>`:''}
      ${st.disc?`<div><span>Descuentos dados</span><b class="num">−${money(st.disc)}</b></div>`:''}
      ${st.gifts.length?`<div><span>Cortesías</span><b class="num">${st.gifts.length}</b></div>`:''}
      <div class="tt"><span>Total vendido</span><b class="num">${money(st.total)}</b></div>
    </div>
    <div class="row">
      <div class="field"><label for="ct-fondo">Fondo inicial</label><input id="ct-fondo" inputmode="decimal" value="${fondo}"></div>
      <div class="field"><label for="ct-contado">Efectivo contado</label><input id="ct-contado" inputmode="decimal" placeholder="$0" value="${prev?prev.contado:''}"></div>
    </div>
    <div class="changebox" id="ct-res"></div>
    <div class="row"><button class="btn ghost" data-act="share-corte">${icon('i-share',18)} Compartir</button><button class="btn primary" data-act="save-corte">Guardar corte</button></div>
  </div></div>`;
  updCorte();
}
function corteData(){const d0=new Date(S.day+'T00:00:00').getTime();const st=dayStats(d0);const fondo=parseAmount($('#ct-fondo').value)||0;const contado=parseAmount($('#ct-contado').value);
  const esperado=fondo+st.by.cash;return {d0,st,fondo,contado:isFinite(contado)?contado:null,esperado,dif:isFinite(contado)?contado-esperado:null}}
function updCorte(){const c=corteData();const el=$('#ct-res');if(!el)return;
  el.innerHTML=`Debe haber <b class="num">${money(c.esperado)}</b>`+(c.dif===null?'':`<br><span style="font-size:15px">${Math.abs(c.dif)<0.5?'La caja cuadra':c.dif>0?'Sobran '+money(c.dif):'Faltan '+money(-c.dif)}</span>`)}
async function saveCorte(){const c=corteData();if(c.contado===null){toast('Escribe cuánto efectivo contaste');return}
  mem.cortes[S.day]={ts:Date.now(),day:S.day,fondo:c.fondo,contado:c.contado,esperado:c.esperado,dif:c.dif,total:c.st.total,...c.st.by};
  await persist('cortes');sync();$('#modal').innerHTML='';render();toast(Math.abs(c.dif)<0.5?'Corte guardado: la caja cuadra':'Corte guardado: '+(c.dif>0?'sobran ':'faltan ')+money(Math.abs(c.dif)))}
async function shareCorte(){
  const c=corteData();const W=576,P=40,K=2,mono='"IBM Plex Mono",Menlo,monospace';
  const lines=[['Efectivo',money(c.st.by.cash)],['Tarjeta',money(c.st.by.card)],['Transferencia',money(c.st.by.transfer)]];
  if(c.st.tips)lines.push(['Propinas',money(c.st.tips)]);if(c.st.disc)lines.push(['Descuentos','−'+money(c.st.disc)]);if(c.st.gifts.length)lines.push(['Cortesías',String(c.st.gifts.length)]);
  const lines2=[['Fondo inicial',money(c.fondo)],['Debe haber',money(c.esperado)]];if(c.contado!==null){lines2.push(['Contado',money(c.contado)]);lines2.push([Math.abs(c.dif)<0.5?'Cuadra':c.dif>0?'Sobran':'Faltan',money(Math.abs(c.dif))])}
  const logo=await getLogo();
  const run=ctx=>{let y=P;const C=W/2;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,3000);
    const lw=300,lh=lw*527/1115;try{ctx.drawImage(logo,C-lw/2,y,lw,lh)}catch(e){}y+=lh+20;
    ctx.fillStyle='#111';ctx.textAlign='center';ctx.font=`600 26px ${mono}`;ctx.fillText('CORTE DE CAJA',C,y+22);y+=36;
    ctx.font=`400 18px ${mono}`;ctx.fillStyle='#444';ctx.fillText(new Date(c.d0).toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),C,y+16);y+=26;ctx.fillText(c.st.orders+' órdenes',C,y+16);y+=30;
    const dash=()=>{ctx.strokeStyle='#999';ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(P,y);ctx.lineTo(W-P,y);ctx.stroke();ctx.setLineDash([]);y+=22};
    const kv=(k,v,b)=>{ctx.font=`${b?600:400} ${b?24:20}px ${mono}`;ctx.fillStyle=b?'#111':'#333';ctx.textAlign='left';ctx.fillText(k,P,y+18);ctx.textAlign='right';ctx.fillText(v,W-P,y+18);y+=b?36:30};
    dash();lines.forEach(([k,v])=>kv(k,v));y+=4;kv('TOTAL',money(c.st.total),true);dash();lines2.forEach(([k,v],i)=>kv(k,v,i===lines2.length-1&&c.contado!==null));
    return y+P};
  const pr=document.createElement('canvas');pr.width=W;pr.height=3000;const H=Math.ceil(run(pr.getContext('2d')));
  const cv=document.createElement('canvas');cv.width=W*K;cv.height=H*K;const ctx=cv.getContext('2d');ctx.scale(K,K);run(ctx);
  ctx.globalCompositeOperation='destination-out';ctx.beginPath();for(let x=0;x<=W;x+=16){ctx.moveTo(x,H);ctx.lineTo(x+8,H-10);ctx.lineTo(x+16,H)}ctx.fill();
  const blob=await new Promise(r=>cv.toBlob(r,'image/png'));const d=new Date(c.d0);const p2=n=>String(n).padStart(2,'0');
  const f=new File([blob],`CafeFrio Corte ${p2(d.getDate())}-${p2(d.getMonth()+1)}-${String(d.getFullYear()).slice(2)}.png`,{type:'image/png'});
  try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:f.name.replace('.png','')});return}}catch(e){if(e&&e.name==='AbortError')return}
  const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove();
}

function saleRow(s){
  const items=(s.items||[]).map(i=>(i.qty>1?i.qty+'× ':'')+i.name).join(', ');const cf=S.confirm===s.id;
  return `<div class="item click" data-ticket="${s.id}"><span class="time">${hhmm(s.ts)}</span><div style="min-width:0"><div class="t1">${s.customer?esc(s.customer)+' · ':''}${esc(items||'Venta')}</div><div class="t2"><span class="pill ${s.method==='card'||s.method==='mp'?'acc':''}">${METHOD_LABEL(s.method)}</span>${s.folio?' · '+folioStr(s.folio):''}${s.discount&&s.method!=='gift'?' · −'+money(s.discount):''}${s.tip?' · propina '+money(s.tip):''}</div></div>
  <div style="display:flex;align-items:center;gap:8px"><span class="amt num">${money(s.total)}</span>${cf?`<button class="iconbtn warn" data-delsale="${s.id}">¿Borrar?</button>`:`<button class="iconbtn" data-confirm="${s.id}" aria-label="Borrar venta">${icon('i-trash',18)}</button>`}</div></div>`;
}
function viewSales(){
  const d0=new Date(S.day+'T00:00:00').getTime();const list=S.sales.filter(s=>s.ts>=d0&&s.ts<d0+DAY).sort((a,b)=>b.ts-a.ts);
  const tot=list.reduce((a,s)=>a+s.total,0);const by={};list.forEach(s=>paidBy(s).forEach(([m,a])=>by[m]=(by[m]||0)+a));
  const tips=list.reduce((a,s)=>a+(+s.tip||0),0),gifts=list.filter(s=>s.method==='gift').length;
  const t=dayKey(Date.now()),y=dayKey(Date.now()-DAY);
  return `<div class="section">
    <div><h1 class="h1">Ventas</h1><div class="sub">${esc(longDate(d0))}</div></div>
    <div class="row" style="align-items:flex-end">
      <div class="chips" style="flex:0 0 auto;min-width:0"><button class="chip" data-day="${t}" aria-pressed="${S.day===t}">Hoy</button><button class="chip" data-day="${y}" aria-pressed="${S.day===y}">Ayer</button></div>
      <div class="field" style="max-width:220px"><label for="daypick">Otro día</label><input type="date" id="daypick" value="${S.day}"></div>
    </div>
    <div class="kpis">
      <div class="kpi hero"><span class="l">Total del día</span><span class="v num">${money(tot)}</span><span class="d">${list.length} ${list.length===1?'venta':'ventas'}${tips?' · '+money(tips)+' en propinas':''}${gifts?' · '+gifts+' cortesía'+(gifts>1?'s':''):''}</span></div>
      ${['cash','card','transfer'].map(k=>`<div class="kpi"><span class="l">${METHODS[k].label}</span><span class="v num">${money(by[k]||0)}</span></div>`).join('')}
    </div>
    ${(()=>{const c=mem.cortes[S.day];return `<button class="cortebtn" data-act="corte"><span>${icon('i-receipt',20)}</span><span style="flex:1;text-align:left"><b>Corte de caja</b><br><span class="sub">${c?(Math.abs(c.dif)<0.5?'Guardado · la caja cuadró':'Guardado · '+(c.dif>0?'sobraron ':'faltaron ')+money(Math.abs(c.dif))):'Cuenta el efectivo y cierra el día'}</span></span><span aria-hidden="true">›</span></button>`})()}
    <div class="panel">${list.length?`<div class="sub" style="margin-bottom:4px">Toca una venta para ver o compartir su ticket.</div><div class="list">${list.map(saleRow).join('')}</div>`:`<div class="empty">No hay ventas registradas este día.</div>`}</div>
  </div>`;
}
function viewMenu(){
  const ps=sortedProducts();const cfg=ticketCfg();const demo=S.sales.filter(s=>s.demo).length;
  return `<div class="section">
    <div class="row" style="align-items:center"><div><h1 class="h1">Menú</h1><div class="sub">${ps.length} productos · fotos, precios e inventario</div></div>
    <button class="btn primary" style="flex:0 0 auto" data-act="new-product">${icon('i-plus',18)} Nuevo producto</button></div>
    ${(()=>{const act=ps.filter(p=>p.active!==false);const on=act.filter(p=>p.today!==false).length;return `<div class="panel">
      <div class="row" style="align-items:center;margin-bottom:10px"><div><h3 style="margin:0">Menú de hoy</h3><div class="sub">${on} de ${act.length} disponibles · toca para prender o apagar</div></div>
      <div style="display:flex;gap:6px;flex:0 0 auto"><button class="btn ghost" style="padding:8px 12px;font-size:13px" data-act="today-all">Todo</button><button class="btn ghost" style="padding:8px 12px;font-size:13px" data-act="today-none">Nada</button></div></div>
      <div class="todaygrid">${act.map(p=>`<button class="todaytile ${p.today!==false?'on':''}" data-today="${p.id}" aria-pressed="${p.today!==false}"><span class="th">${thumb(p)}</span><span class="tn">${esc(p.name)}</span><span class="ck">${icon('i-check',14)}</span></button>`).join('')}</div>
    </div>`})()}
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
      <label class="check" style="margin-top:6px"><input type="checkbox" id="tk-qr" ${cfg.showQR?'checked':''}> Código QR a su Instagram</label>
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
  const by={};list.forEach(s=>paidBy(s).forEach(([m,a])=>by[m]=(by[m]||0)+a));const paidTot=Object.values(by).reduce((a,b)=>a+b,0)||1;
  const giftCost=list.filter(s=>s.method==='gift').reduce((a,s)=>a+(s.items||[]).reduce((b,i)=>b+(+i.cost||0)*(+i.qty||0),0),0);
  const wd={};list.forEach(s=>{const d=new Date(s.ts).getDay();wd[d]=(wd[d]||0)+s.total});const bw=Object.entries(wd).sort((a,b)=>b[1]-a[1])[0];
  const wdn=d=>['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d];
  return `<div class="section">${head}
    <div class="kpis">
      <div class="kpi hero"><span class="l">Ventas</span><span class="v num">${money(tot)}</span><span class="d">${delta===null?'sin periodo previo':(delta>=0?'▲ ':'▼ ')+Math.abs(delta)+'% vs periodo anterior'}</span></div>
      <div class="kpi"><span class="l">Órdenes</span><span class="v num">${list.length}</span><span class="d">${units} productos</span></div>
      <div class="kpi"><span class="l">Ticket promedio</span><span class="v num">${money(tot/Math.max(1,list.filter(s=>s.method!=='gift').length))}</span><span class="d">por orden</span></div>
      <div class="kpi"><span class="l">Utilidad estimada</span><span class="v num">${money(tot-cost)}</span><span class="d">${cost>0?Math.round((tot-cost)/tot*100)+'% margen bruto':'agrega costos en Menú'}</span></div>
    </div>
    <div class="panel chart"><h3>${chart.t}</h3>${chart.svg}<div class="sub" style="margin-top:6px">${peak?`Hora más movida: <b>${peak[0]}:00</b> (${peak[1]} órdenes).`:''}${bw&&S.range>=7?` Día más fuerte: <b>${wdn(+bw[0])}</b>.`:''}</div></div>
    <div class="two">
      <div class="panel"><h3>Lo que más se vende</h3>${topA.map(([n,v])=>`<div class="hbar"><span class="nm">${esc(n)}</span><span class="vv num">${v.q} · ${money(v.r)}</span><span class="tr"><i style="width:${(v.r/tm*100).toFixed(1)}%"></i></span></div>`).join('')}</div>
      <div class="panel"><h3>Cómo te pagan</h3>
        <div class="split">${['cash','card','transfer'].map(k=>by[k]?`<i style="width:${(by[k]/paidTot*100).toFixed(2)}%;background:${METHODS[k].color}" title="${METHODS[k].label}"></i>`:'').join('')}</div>
        <div class="legend">${['cash','card','transfer'].map(k=>`<span><i style="background:${METHODS[k].color}"></i>${METHODS[k].label} <b class="mono num">${Math.round((by[k]||0)/paidTot*100)}%</b></span>`).join('')}</div>
        ${giftCost?`<div class="sub" style="margin-top:8px">Cortesías: ${money(giftCost)} en costo de producto.</div>`:''}
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
      <ol class="steps"><li>En tu cuenta de Mercado Pago (desde la computadora) abre <b>Reportes</b>.</li><li>Genera el reporte de cobros o de actividad del periodo y descárgalo en <b>CSV</b>.</li><li>Súbelo aquí: cada cobro se empata con una venta con tarjeta o transferencia del mismo monto (±45 min).</li></ol>
      <label class="btn primary" for="mpfile" style="margin-top:12px">${icon('i-mp',18)} Elegir archivo CSV</label><input type="file" id="mpfile" accept=".csv,text/csv,text/plain" hidden>
    </div>
    ${L.length?`<div class="kpis">
      <div class="kpi hero"><span class="l">Cobros importados</span><span class="v num">${money(tot)}</span><span class="d">${L.length} movimientos</span></div>
      <div class="kpi"><span class="l">Empatados</span><span class="v num">${ok}</span><span class="d">con una venta</span></div>
      <div class="kpi"><span class="l">Sin venta</span><span class="v num">${L.length-ok}</span><span class="d">cobrado, no registrado</span></div>
      <div class="kpi"><span class="l">Ventas sin cobro</span><span class="v num">${orphanSales.length}</span><span class="d">tarjeta o transferencia, sin movimiento</span></div>
    </div>
    <div class="panel"><h3>Movimientos</h3><div class="list">${L.slice(0,150).map(m=>{const s=match[m.id];return `<div class="item"><span class="time">${new Date(m.ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}<br>${hhmm(m.ts)}</span><div style="min-width:0"><div class="t1">${esc(m.desc||'Cobro')}</div><div class="t2">${s?`<span class="pill">empatado</span> venta de las ${hhmm(s.ts)}`:`<span class="pill acc">sin venta</span>`}${m.ref?' · #'+esc(m.ref):''}</div></div><div style="display:flex;align-items:center;gap:8px"><span class="amt num">${money(m.amount)}</span>${!s?`<button class="btn ghost" style="padding:6px 10px;font-size:12px" data-mpsale="${esc(m.id)}">Registrar</button>`:''}</div></div>`}).join('')}</div></div>
    ${orphanSales.length?`<div class="panel"><h3>Ventas con tarjeta o transferencia sin cobro en el reporte</h3><div class="list">${orphanSales.slice(0,60).map(saleRow).join('')}</div></div>`:''}`
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
function readTicketForm(){return {title:$('#tk-title').value.trim(),subtitle:$('#tk-sub').value.trim(),footer:$('#tk-foot').value.trim(),ig:$('#tk-ig').value.trim(),showLogo:$('#tk-logo').checked,showQR:$('#tk-qr').checked}}

/* ---------- efecto al presionar (se ve al grabar pantalla) ---------- */
const PRESSABLE='button,label.btn,a.btn,[data-ticket],.cortebtn';
document.addEventListener('pointerdown',e=>{const t=e.target.closest(PRESSABLE);if(!t||t.disabled)return;t.classList.add('is-pressed');t._pt=Date.now()},{passive:true});
const unpress=()=>document.querySelectorAll('.is-pressed').forEach(t=>{const w=Math.max(0,140-(Date.now()-(t._pt||0)));setTimeout(()=>t.classList.remove('is-pressed'),w)});
['pointerup','pointercancel','pointerleave'].forEach(ev=>document.addEventListener(ev,unpress,{passive:true}));

/* ---------- toque largo en productos: quitar de la orden ---------- */
let lp=null,suppressClick=false;
document.addEventListener('pointerdown',e=>{
  const t=e.target.closest('[data-tile]');if(!t)return;
  const pid=t.dataset.tile;lp={x:e.clientX,y:e.clientY,el:t,timer:setTimeout(()=>{if(S.cart[pid]){t.classList.add('pressing');dropItem(pid);suppressClick=true;setTimeout(()=>t.classList.remove('pressing'),220)}lp=null},480)};
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
  if(d.pay){if(d.pay==='cash')openTender();else if(d.pay==='mixed')openMixed();else if(d.pay==='gift')openGift();else finalize(d.pay);return}
  if(d.disc!==undefined){S.disc=+d.disc;render();return}
  if(d.tip!==undefined){S.tip=+d.tip;render();return}
  if(d.tend){t.parentNode.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===t));$('#tend-in').value='';setTender(+d.tend);return}
  if(d.range){S.range=+d.range;render();return}
  if(d.day){S.day=d.day;S.confirm=null;render();return}
  if(d.confirm){S.confirm=d.confirm;render();return}
  if(d.delsale){S.confirm=null;deleteSale(d.delsale);return}
  if(d.ticket){const s=S.sales.find(x=>x.id===d.ticket);if(s)openTicket(s,false);return}
  if(d.held){resumeHeld(d.held);return}
  if(d.ready){markReady(d.ready);return}
  if(d.undo){const s=mem.sales[d.undo];if(s){s.prep='pending';delete s.doneTs;persist('sales');sync();render()}return}
  if(d.today){const p=mem.products[d.today];if(p){p.today=p.today===false;persist('products');sync();render()}return}
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
    case 'today-all':case 'today-none':{const v=d.act==='today-all';for(const p of Object.values(mem.products))p.today=v;persist('products');sync();render();toast(v?'Todo el menú disponible hoy':'Menú de hoy vacío: elige qué hay');break}
    case 'corte':openCorte();break;
    case 'save-corte':saveCorte();break;
    case 'share-corte':shareCorte();break;
    case 'hold':holdOrder();break;
    case 'adj':S.adjOpen=!S.adjOpen;render();break;
    case 'confirm-mixed':{const total=cartTotal();const c=Math.min(parseAmount($('#mx-cash').value)||0,total);const o=$('#mx-other').value;$('#modal').innerHTML='';finalize('mixed',0,[{method:'cash',amount:c},{method:o,amount:Math.round((total-c)*100)/100}]);break}
    case 'confirm-gift':$('#modal').innerHTML='';finalize('gift');break;
    case 'open-order':S.orderOpen=true;S.animOrder=true;renderOrder();break;
    case 'close-order':closeOrderSheet();break;
    case 'clear-order':clearOrder();render();break;
    case 'confirm-cash':{const total=cartTotal();const v=tendered>0?tendered:total;$('#modal').innerHTML='';finalize('cash',v>=total?v:0);break}
    case 'close-modal':closeModal();break;
    case 'new-order':closeModal(true);break;
    case 'share-ticket':shareTicket();break;
    case 'save-ticket-img':saveTicketImg();break;
    case 'copy-image':copyImage();break;
    case 'new-product':openProduct(null);break;
    case 'save-product':saveProduct(d.id||null);break;
    case 'save-entry':saveEntry(d.id);break;
    case 'rm-photo':draftPhoto=null;$('#p-th').innerHTML=thumb({cat:$('#p-cat').value});t.hidden=true;break;
    case 'del-product':if(t.dataset.armed){$('#modal').innerHTML='';remove('products',d.id).then(()=>toast('Producto borrado'))}else{t.dataset.armed='1';t.textContent='¿Seguro?'}break;
    case 'save-ticket':put('config','ticket',readTicketForm()).then(()=>toast('Ticket guardado'));break;
    case 'preview-ticket':{const old=S.config;S.config=[{id:'ticket',...readTicketForm()}];const ex={ts:Date.now(),folio:129,customer:'Maggie',method:'cash',received:200,items:[{name:'Brew Chai',qty:1,price:90},{name:'Pay',qty:1,price:50}],subtotal:140,discount:14,discPct:10,total:126};openTicket(ex,false).finally(()=>{S.config=old});break}
    case 'backup':exportBackup();break;
    case 'csv':exportSalesCSV();break;
    case 'clear-demo':if(t.dataset.armed){for(const k of Object.keys(mem.sales))if(mem.sales[k].demo)delete mem.sales[k];persist('sales');sync();render();toast('Ventas de prueba borradas')}else{t.dataset.armed='1';t.textContent='¿Seguro? Toca otra vez'}break;
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='cust')S.customer=e.target.value;
  if(e.target.id==='q'){S.search=e.target.value;$('#main').innerHTML=viewCaja()}
  if(e.target.id==='mx-cash')updMixed();
  if(e.target.id==='ct-fondo'||e.target.id==='ct-contado')updCorte();
  if(e.target.id==='tend-in'){document.querySelectorAll('#tender button').forEach(b=>b.setAttribute('aria-pressed','false'));setTender(parseAmount(e.target.value)||0)}
});
document.addEventListener('change',e=>{
  if(e.target.id==='mx-other')updMixed();
  if(e.target.id==='daypick'&&e.target.value){S.day=e.target.value;e.target.blur();render()}
  if(e.target.id==='mpfile'&&e.target.files[0]){importMP(e.target.files[0]);e.target.value=''}
  if(e.target.id==='restore'&&e.target.files[0]){importBackup(e.target.files[0]);e.target.value=''}
  if(e.target.id==='p-file'&&e.target.files[0]){loadPhoto(e.target.files[0]);e.target.value=''}
});
document.addEventListener('focusout',e=>{if(e.target.closest&&e.target.closest('#main'))setTimeout(()=>{const a=document.activeElement;if(!a||!(a.closest('#main')||a.id==='cust'))render()},0)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(scan)closeScanner();else $('#modal').innerHTML='';S.orderOpen=false;render()}});
matchMedia(BP).addEventListener('change',()=>{if(!wide()&&S.tab==='barra')S.tab='caja';$('#orderhost').dataset.mode='';render()});
setInterval(()=>{const a=document.activeElement;if(a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))return;if(S.tab==='barra')$('#main').innerHTML=viewBarra();else if(S.tab==='caja'&&S.held.length&&wide())render()},30000);

/* ---------- arranque ---------- */
try{if(localStorage.getItem('cf-theme')==='dark'){document.documentElement.classList.add('dark');document.querySelector('meta[name="theme-color"]').content='#0D0D0D'}}catch(e){}
render();
(async()=>{
  await loadAll();await seedIfEmpty();await migrate();sync();S.ready=true;render();
  if('serviceWorker' in navigator&&location.protocol==='https:'){try{navigator.serviceWorker.register('sw.js')}catch(e){}}
})();
})();
