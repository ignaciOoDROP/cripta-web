/* CRIPTA — tienda. Los textos salen de content.json (se editan en admin.html) y el stock de la planilla de Google. */
(function(){
'use strict';

var C = {}, STOCK = [], WA = '';
var $ = function(s, el){ return (el || document).querySelector(s); };
var $$ = function(s, el){ return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pesos(n){ return n ? '$' + Number(n).toLocaleString('es-AR') : 'Consultar'; }
function linkWA(m){ return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(m); }
function get(obj, path){ return path.split('.').reduce(function(o,k){ return o == null ? o : o[k]; }, obj); }

/* ---------- carga ---------- */
function cargarContenido(){
  var borrador = null;
  if (/[?&]preview\b/.test(location.search)) {
    try { borrador = JSON.parse(localStorage.getItem('cripta-preview')); } catch(e) {}
  }
  if (borrador) { mostrarAvisoPreview(); return Promise.resolve(borrador); }
  return fetch('content.json?t=' + Date.now()).then(function(r){ return r.json(); });
}
function mostrarAvisoPreview(){
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:90;background:#ffc400;color:#0a0a0b;padding:10px 14px;border-radius:12px;font:700 13px Manrope,sans-serif';
  d.textContent = 'Vista previa: así se verá cuando publiques';
  document.body.appendChild(d);
}

/* planilla CSV → productos */
function parseCSV(t){
  var rows = [], row = [], cur = '', q = false;
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (q) { if (c === '"') { if (t[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i+1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function esSi(v){ return ['si','sí','s','x','yes','true','1','vendida'].indexOf(String(v || '').trim().toLowerCase()) >= 0; }
function slug(s){ return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50); }
function categoria(marca, modelo, mem){
  var t = (marca + ' ' + modelo).toLowerCase();
  if (/\bpc\b/.test(t)) return 'pc';
  if (/xbox|playstation|\bps[345]\b|nintendo|consola/.test(t)) return 'consola';
  if (/fuente|\bpsu\b/.test(t)) return 'fuente';
  if (/ddr/i.test(mem) || /memoria|ram\b/i.test(modelo)) return 'ram';
  return 'gpu';
}
function fotoURL(v){
  v = String(v || '').trim();
  var d = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  if (d) return 'https://drive.google.com/thumbnail?id=' + d[1] + '&sz=w1000';
  return v;
}
function desdePlanilla(txt, respaldo){
  var locales = {};
  (respaldo || []).forEach(function(p){ if (/^img\//.test(p.foto)) locales[p.id] = p.foto; });
  var rows = parseCSV(txt).filter(function(r){ return r.some(function(c){ return c.trim(); }); });
  var head = rows.shift().map(function(h){ return h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); });
  var col = function(r, n){ var i = head.indexOf(n); return i >= 0 ? (r[i] || '').trim() : ''; };
  var vistos = {};
  return rows.map(function(r){
    var marca = col(r,'marca'), modeloRaw = col(r,'modelo').replace(/​/g,''), mem = col(r,'vram');
    var aPedido = /a pedido/i.test(modeloRaw);
    var modelo = modeloRaw.replace(/\s*\(\s*a pedido\s*\)?/i,'').trim();
    var id = slug(marca + ' ' + modeloRaw);
    var foto = fotoURL(col(r,'foto'));
    if (!/^img\//.test(foto) && locales[id]) foto = locales[id];
    return { id:id, marca:marca, modelo:modelo, categoria:categoria(marca, modelo, mem), memoria:mem, uso:col(r,'uso'),
      precio:Number(col(r,'precio').replace(/\D/g,'')) || 0, foto:foto,
      estado: esSi(col(r,'vendida')) ? 'vendida' : aPedido ? 'a-pedido' : 'disponible',
      destacada: esSi(col(r,'destacada')), oferta: esSi(col(r,'oferta')),
      precioAnterior:Number(col(r,'precio anterior').replace(/\D/g,'')) || 0, nota:'' };
  }).filter(function(p){ if (!p.modelo || vistos[p.id]) return false; vistos[p.id] = 1; return true; });
}
function cargarStock(){
  var url = C.ajustes && C.ajustes.planilla;
  if (!url) return Promise.resolve(C.productos || []);
  var ctrl = window.AbortController ? new AbortController() : null;
  var corte = setTimeout(function(){ if (ctrl) ctrl.abort(); }, 10000);
  return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), ctrl ? { signal: ctrl.signal } : {})
    .then(function(r){ if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function(t){ clearTimeout(corte); var l = desdePlanilla(t, C.productos); if (!l.length) throw new Error('vacía'); return l; })
    .catch(function(){ clearTimeout(corte); return C.productos || []; });
}

/* ---------- textos ---------- */
function pintarTextos(){
  $$('[data-t]').forEach(function(el){ var v = get(C, el.getAttribute('data-t')); if (v != null) el.textContent = v; });
  var a = C.ajustes || {};
  WA = String(a.whatsapp || '').replace(/\D/g,'');
  $$('[data-wa-general]').forEach(function(el){ el.href = linkWA(a.mensajeWhatsApp || 'Hola! Quería hacer una consulta.'); });
  var ig = 'https://www.instagram.com/' + (a.instagram || '') + '/';
  $('#ig-link').href = ig; $('#ig-foot').href = ig; $('#ig-handle').textContent = '@' + (a.instagram || '');
  $('#ciudad').textContent = a.ciudad || ''; $('#year').textContent = new Date().getFullYear();

  var bar = (C.barraSuperior || []).map(function(t){ return '<span>' + esc(t) + '</span>'; }).join('');
  $('#topbar').innerHTML = bar + bar + bar + bar;
  var marcas = (C.marcas || []).map(function(t){ return '<span>' + esc(t) + '</span>'; }).join('');
  $('#marcas').innerHTML = marcas + marcas;

  $('#beneficios').innerHTML = (C.beneficios || []).map(function(b, i){
    return '<div class="perk reveal" style="transition-delay:' + i * 80 + 'ms"><span class="perk-ic">' + esc(b.icono) + '</span><div><b>' + esc(b.titulo) + '</b><p>' + esc(b.texto) + '</p></div></div>';
  }).join('');
  $('#vender-lista').innerHTML = ((C.vender && C.vender.lista) || []).map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('');
  $('#pasos').innerHTML = (C.pasos || []).map(function(p, i){
    return '<li class="step reveal" style="transition-delay:' + i * 90 + 'ms"><span class="num">' + String(i + 1).padStart(2, '0') + '</span><b>' + esc(p.titulo) + '</b><p>' + esc(p.texto) + '</p></li>';
  }).join('');
  $('#faq').innerHTML = (C.preguntas || []).map(function(f){
    return '<details class="reveal"><summary>' + esc(f.pregunta) + '</summary><p>' + esc(f.respuesta) + '</p></details>';
  }).join('');
  $('#ig-grid').innerHTML = (C.fotosInstagram || []).map(function(src, i){
    return '<a class="reveal" style="transition-delay:' + (i % 4) * 70 + 'ms" href="' + esc(ig) + '" target="_blank" rel="noopener"><img src="' + esc(src) + '" alt="Publicación de @' + esc(a.instagram) + '" loading="lazy"></a>';
  }).join('');
}

/* ---------- imágenes ---------- */
function silueta(p){
  var t = esc(p.marca);
  if (p.categoria === 'ram') return '<svg viewBox="0 0 240 120" role="img" aria-label="' + t + '"><rect x="10" y="30" width="220" height="56" rx="4" fill="#24242a"/><rect x="10" y="78" width="220" height="16" fill="#c8a020"/>' +
    [0,1,2,3,4,5,6,7].map(function(i){ return '<rect x="' + (22+i*26) + '" y="40" width="18" height="26" rx="2" fill="#3a3a42"/>'; }).join('') + '</svg>';
  return '<svg viewBox="0 0 240 140" role="img" aria-label="' + t + '"><rect x="8" y="24" width="224" height="90" rx="10" fill="#24242a"/><rect x="40" y="114" width="120" height="10" fill="#c8a020"/>' +
    '<circle cx="78" cy="69" r="34" fill="#141416"/><circle cx="78" cy="69" r="10" fill="#3a3a42"/><circle cx="162" cy="69" r="34" fill="#141416"/><circle cx="162" cy="69" r="10" fill="#3a3a42"/></svg>';
}
function imagen(cont, p, eager){
  if (!p.foto) { cont.insertAdjacentHTML('afterbegin', silueta(p)); return; }
  var img = new Image(); if (!eager) img.loading = 'lazy'; img.alt = p.marca + ' ' + p.modelo; img.src = p.foto;
  img.onerror = function(){ img.replaceWith(document.createRange().createContextualFragment(silueta(p))); };
  cont.prepend(img);
}

/* ---------- catálogo ---------- */
var NIVELES = ['1080p','1440p','4K'];
function medidor(uso){
  var n = NIVELES.indexOf(uso) + 1;
  if (!n) return '';
  return '<div class="meter" aria-label="Rinde hasta ' + esc(uso) + '"><div class="meter-bar">' + NIVELES.map(function(_,i){ return '<i class="' + (i < n ? 'on' : '') + '" style="--k:' + i + '"></i>'; }).join('') + '</div>' +
    '<div class="meter-lbl">' + NIVELES.map(function(l,i){ return '<span class="' + (i === n-1 ? 'on' : '') + '">' + l + '</span>'; }).join('') + '</div></div>';
}
function memNum(p){ var m = /(\d+)\s*GB/i.exec(p.categoria === 'ram' ? p.modelo : p.memoria); return m ? Number(m[1]) : 0; }
function specs(p){
  if (p.categoria === 'gpu') {
    var f = ficha(p), out = ['<span>' + esc(p.memoria) + (f ? ' ' + esc(f.mem.split(' ·')[0]) : ' VRAM') + '</span>'];
    if (f) out.push('<span>' + f.tdp + ' W</span>');
    if (condicion(p)) out.push('<span class="cond">' + condicion(p) + '</span>');
    return out;
  }
  return [p.memoria, p.uso].filter(Boolean).map(function(x){ return '<span>' + esc(x) + '</span>'; });
}
/* Ficha técnica por modelo de chip (datos de fábrica de referencia) */
var FICHAS = [
  [/rx\s*550\b/i,      { arq:'AMD Polaris', mem:'GDDR5 · 128-bit', tdp:50,  psu:400, tec:'FreeSync' }],
  [/1050\s*ti/i,       { arq:'NVIDIA Pascal', mem:'GDDR5 · 128-bit', tdp:75,  psu:300, tec:'G-Sync compatible · NVENC' }],
  [/1650\s*super/i,    { arq:'NVIDIA Turing', mem:'GDDR6 · 128-bit', tdp:100, psu:350, tec:'NVENC Turing' }],
  [/gtx\s*1650/i,      { arq:'NVIDIA Turing', mem:'GDDR5/6 · 128-bit', tdp:75, psu:300, tec:'NVENC' }],
  [/1660\s*ti/i,       { arq:'NVIDIA Turing', mem:'GDDR6 · 192-bit', tdp:120, psu:450, tec:'NVENC Turing' }],
  [/rx\s*5[78]0\b/i,   { arq:'AMD Polaris', mem:'GDDR5 · 256-bit', tdp:185, psu:500, tec:'FreeSync' }],
  [/5700\s*xt/i,       { arq:'AMD RDNA', mem:'GDDR6 · 256-bit', tdp:225, psu:600, tec:'FreeSync · Radeon Anti-Lag · FSR' }],
  [/rx\s*5700\b/i,     { arq:'AMD RDNA', mem:'GDDR6 · 256-bit', tdp:180, psu:600, tec:'FreeSync · Radeon Anti-Lag · FSR' }],
  [/2060\s*super/i,    { arq:'NVIDIA Turing', mem:'GDDR6 · 256-bit', tdp:175, psu:550, tec:'Ray tracing · DLSS' }],
  [/rtx\s*2060/i,      { arq:'NVIDIA Turing', mem:'GDDR6 · 192-bit', tdp:160, psu:500, tec:'Ray tracing · DLSS' }],
  [/rtx\s*3050/i,      { arq:'NVIDIA Ampere', mem:'GDDR6 · 128-bit', tdp:130, psu:550, tec:'Ray tracing · DLSS' }],
  [/3060\s*ti/i,       { arq:'NVIDIA Ampere', mem:'GDDR6 · 256-bit', tdp:200, psu:600, tec:'Ray tracing · DLSS' }],
  [/rtx\s*3060/i,      { arq:'NVIDIA Ampere', mem:'GDDR6 · 192-bit', tdp:170, psu:550, tec:'Ray tracing · DLSS' }],
  [/3070\s*ti/i,       { arq:'NVIDIA Ampere', mem:'GDDR6X · 256-bit', tdp:290, psu:750, tec:'Ray tracing · DLSS' }],
  [/rtx\s*3070/i,      { arq:'NVIDIA Ampere', mem:'GDDR6 · 256-bit', tdp:220, psu:650, tec:'Ray tracing · DLSS' }],
  [/rtx\s*3080/i,      { arq:'NVIDIA Ampere', mem:'GDDR6X · 320-bit', tdp:320, psu:750, tec:'Ray tracing · DLSS' }],
  [/rtx\s*3090/i,      { arq:'NVIDIA Ampere', mem:'GDDR6X · 384-bit', tdp:350, psu:750, tec:'Ray tracing · DLSS · NVLink' }],
  [/rtx\s*5060/i,      { arq:'NVIDIA Blackwell', mem:'GDDR7 · 128-bit', tdp:145, psu:550, tec:'Ray tracing · DLSS 4' }],
  [/rtx\s*5070/i,      { arq:'NVIDIA Blackwell', mem:'GDDR7 · 192-bit', tdp:250, psu:650, tec:'Ray tracing · DLSS 4' }],
  [/6700\s*xt/i,       { arq:'AMD RDNA 2', mem:'GDDR6 · 192-bit', tdp:230, psu:650, tec:'Ray tracing · FSR · Infinity Cache' }],
  [/6800\s*xt/i,       { arq:'AMD RDNA 2', mem:'GDDR6 · 256-bit', tdp:300, psu:750, tec:'Ray tracing · FSR · Infinity Cache' }],
  [/6900\s*xt/i,       { arq:'AMD RDNA 2', mem:'GDDR6 · 256-bit', tdp:300, psu:850, tec:'Ray tracing · FSR · Infinity Cache' }],
  [/9070\s*xt/i,       { arq:'AMD RDNA 4', mem:'GDDR6 · 256-bit', tdp:304, psu:750, tec:'Ray tracing · FSR 4' }]
];
var IDEAL = {
  '1080p':'Juegos competitivos (Fortnite, Valorant, CS2, LoL) con muchos FPS a 1080p.',
  '1440p':'Juegos AAA a 1440p en calidad alta, y competitivos a altos FPS.',
  '4K':'Juegos en 4K, edición de video, render 3D e IA.'
};
function ficha(p){
  if (p.categoria !== 'gpu') return null;
  for (var i = 0; i < FICHAS.length; i++) if (FICHAS[i][0].test(p.modelo)) return FICHAS[i][1];
  return null;
}
function condicion(p){
  var t = p.modelo.toLowerCase();
  if (/fullbox/.test(t)) return 'Fullbox';
  if (/en caja/.test(t)) return 'En caja';
  if (/sin caja/.test(t)) return 'Sin caja';
  return '';
}
function nombreLimpio(p){ return p.modelo.replace(/\s*\((en caja|sin caja|fullbox)[^)]*\)/i, '').trim(); }
function descuento(p){ return p.precioAnterior > p.precio && p.precio ? Math.round((1 - p.precio / p.precioAnterior) * 100) : 0; }
function precioHTML(p, cls){
  var d = descuento(p);
  return '<span class="' + cls + '">' + pesos(p.precio) + '</span>' + (d ? '<span class="was">' + pesos(p.precioAnterior) + '</span><span class="off">-' + d + '%</span>' : '');
}

function disponibles(){ return STOCK.filter(function(p){ return p.estado !== 'vendida'; }); }

var CATS = [
  ['todo','Todo',''],
  ['gpu','Placas de video','<svg class="cat-ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="12" width="40" height="22" rx="3"/><circle cx="17" cy="23" r="6"/><circle cx="32" cy="23" r="6"/><path d="M10 34v5h18v-5"/></svg>'],
  ['ram','Memorias RAM','<svg class="cat-ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="15" width="40" height="16" rx="2"/><path d="M10 20h5v6h-5zM21 20h5v6h-5zM32 20h5v6h-5zM4 31v4h40v-4M23 35v-4"/></svg>'],
  ['pc','PCs armadas','<svg class="cat-ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="12" y="4" width="24" height="40" rx="3"/><circle cx="24" cy="16" r="5"/><circle cx="24" cy="30" r="5"/><path d="M17 39h14"/></svg>'],
  ['fuente','Fuentes','<svg class="cat-ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="10" width="38" height="28" rx="3"/><circle cx="20" cy="24" r="8"/><path d="m35 17-3 6h4l-3 6"/></svg>'],
  ['consola','Consolas','<svg class="cat-ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 14h20a9 9 0 0 1 9 9l1 7a5 5 0 0 1-9 3l-3-4H16l-3 4a5 5 0 0 1-9-3l1-7a9 9 0 0 1 9-9Z"/><path d="M14 20v6M11 23h6"/><circle cx="32" cy="21" r="1.5" fill="currentColor"/><circle cx="35" cy="25" r="1.5" fill="currentColor"/></svg>']
];
var estado = { cat:'todo', q:'', orden:'asc', res:'' };

function armarCategorias(){
  var html = '';
  CATS.slice(1).forEach(function(c, i){
    var n = disponibles().filter(function(p){ return p.categoria === c[0]; }).length;
    if (!n && c[0] !== 'gpu') return;
    html += '<button type="button" class="cat reveal" style="transition-delay:' + i * 70 + 'ms" data-cat="' + c[0] + '">' + c[2] +
      '<span class="cat-arrow" aria-hidden="true">↗</span><span><b>' + c[1] + '</b><small>' + n + (n === 1 ? ' disponible' : ' disponibles') + '</small></span></button>';
  });
  $('#cats').innerHTML = html;
  $$('#cats .cat').forEach(function(b){ b.onclick = function(){ elegirCat(b.dataset.cat); $('#catalogo').scrollIntoView(); }; });
}
function armarTabs(){
  var tabs = $('#tabs'); tabs.innerHTML = '';
  CATS.forEach(function(c){
    var n = disponibles().filter(function(p){ return c[0] === 'todo' || p.categoria === c[0]; }).length;
    if (!n && c[0] !== 'todo') return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.dataset.cat = c[0];
    b.innerHTML = c[1] + ' <span>' + n + '</span>';
    b.setAttribute('aria-pressed', c[0] === estado.cat);
    b.onclick = function(){ elegirCat(c[0]); };
    tabs.appendChild(b);
  });
}
function elegirCat(cat){
  estado.cat = cat;
  $$('#tabs .tab').forEach(function(x){ x.setAttribute('aria-pressed', x.dataset.cat === cat); });
  $('#res').hidden = !(cat === 'todo' || cat === 'gpu');
  render();
}

function render(){
  var cont = $('#productos'); cont.innerHTML = '';
  var lista = disponibles().filter(function(p){
    if (estado.cat !== 'todo' && p.categoria !== estado.cat) return false;
    if (estado.res && !(p.categoria === 'gpu' && p.uso === estado.res)) return false;
    return !estado.q || (p.marca + ' ' + p.modelo + ' ' + p.memoria).toLowerCase().indexOf(estado.q) >= 0;
  });
  var cmp = { asc:function(a,b){ return a.precio - b.precio; }, desc:function(a,b){ return b.precio - a.precio; }, mem:function(a,b){ return memNum(b) - memNum(a) || a.precio - b.precio; } }[estado.orden];
  lista.sort(cmp);
  vista = lista;
  $('#results').textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos');
  if (!lista.length) {
    cont.innerHTML = '<div class="empty">No encontramos eso en stock. <a target="_blank" rel="noopener" href="' + esc(linkWA('Hola! Busco: ' + (estado.q || 'un componente'))) + '">Escribinos y te lo conseguimos</a>.</div>';
    return;
  }
  lista.forEach(function(p, i){
    var art = document.createElement('article'); art.className = 'card'; art.style.setProperty('--i', Math.min(i, 12));
    art.innerHTML = '<div class="card-img" role="button" tabindex="0" aria-label="Ver detalle"><div class="badges"><span class="pill"></span>' +
      (p.oferta ? '<span class="pill pill-hot">Oferta</span>' : p.estado === 'a-pedido' ? '<span class="pill pill-y">A pedido</span>' : p.destacada ? '<span class="pill pill-y">Destacada</span>' : '<span class="pill pill-dot">En mano</span>') + '</div>' +
      '<button class="quick" type="button">Vista rápida</button></div>' +
      '<div class="card-body"><h3></h3><div class="specs">' + specs(p).join('') + '</div>' + (p.categoria === 'gpu' ? medidor(p.uso) : '') +
      '<div class="price-row"><div class="price-line">' + precioHTML(p, 'price') + '</div><small>' + (p.estado === 'a-pedido' ? 'Llega en días · consultá demora' : 'Efectivo o transferencia') + '</small></div>' +
      '<div class="card-actions"><a class="btn btn-primary" target="_blank" rel="noopener"></a>' +
      '<button class="add" type="button" aria-label="Agregar al pedido"></button></div></div>';
    $('.badges .pill', art).textContent = p.marca;
    $('h3', art).textContent = nombreLimpio(p);
    if (p.oferta) art.classList.add('is-hot');
    imagen($('.card-img', art), p);
    var buy = $('.btn', art);
    buy.textContent = p.estado === 'a-pedido' ? 'Encargar' : 'Comprar por WhatsApp';
    buy.href = linkWA('Hola! Me interesa la ' + p.marca + ' ' + p.modelo + (p.memoria ? ' (' + p.memoria + ')' : '') + ' a ' + pesos(p.precio) + '. ¿Está disponible?');
    var add = $('.add', art); pintarAdd(add, p.id);
    add.onclick = function(){ toggleCarrito(p); pintarAdd(add, p.id); add.classList.remove('bump'); void add.offsetWidth; add.classList.add('bump'); };
    var img = $('.card-img', art);
    img.onclick = function(){ abrirModal(p); };
    img.onkeydown = function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirModal(p); } };
    cont.appendChild(art);
  });
}
function pintarAdd(btn, id){
  var en = !!carrito[id];
  btn.classList.toggle('in', en);
  btn.setAttribute('aria-label', en ? 'Quitar del pedido' : 'Agregar al pedido');
  btn.innerHTML = en ? '<svg viewBox="0 0 24 24" width="20" height="20"><path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                     : '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
}

/* ---------- vista rápida ---------- */
var modal = $('#modal'), actual = null, vista = [];
function abrirModal(p){
  actual = p;
  var box = $('#m-img'); box.innerHTML = ''; imagen(box, p, true); zoomReset();
  var idx = vista.indexOf(p), hay = idx > -1 && vista.length > 1;
  $('#m-prev').hidden = $('#m-next').hidden = !hay;
  $('#m-count').textContent = hay ? (idx + 1) + ' / ' + vista.length : '';
  $('#m-marca').textContent = p.marca;
  $('#m-title').textContent = p.modelo;
  $('#m-specs').innerHTML = specs(p).join('');
  $('#m-meter').innerHTML = p.categoria === 'gpu' ? medidor(p.uso) : '';
  $('#m-nota').textContent = p.nota || (p.estado === 'a-pedido' ? 'Producto a pedido: llega en pocos días.' : 'Disponible para ver y probar en Tucumán.');
  $('#m-title').textContent = nombreLimpio(p);
  $('#m-price').innerHTML = precioHTML(p, 'now');
  var f = ficha(p), filas = [];
  if (p.categoria === 'gpu') {
    filas.push(['Memoria', p.memoria + (f ? ' ' + f.mem : '')]);
    if (f) { filas.push(['Arquitectura', f.arq]); filas.push(['Consumo', 'hasta ' + f.tdp + ' W']); filas.push(['Fuente recomendada', f.psu + ' W o más']); filas.push(['Tecnologías', f.tec]); }
    if (IDEAL[p.uso]) filas.push(['Ideal para', IDEAL[p.uso]]);
  } else {
    if (p.memoria) filas.push(['Detalle', p.memoria]);
    if (p.uso) filas.push([p.categoria === 'ram' ? 'Uso' : 'Extra', p.uso]);
  }
  if (condicion(p)) filas.push(['Estado', condicion(p)]);
  $('#m-ficha').innerHTML = filas.map(function(r){ return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
  $('#m-buy').href = linkWA('Hola! Me interesa la ' + p.marca + ' ' + p.modelo + ' a ' + pesos(p.precio) + '. ¿Está disponible?');
  pintarModalAdd();
  if (modal.showModal) modal.showModal(); else modal.setAttribute('open','');
}
function pintarModalAdd(){ $('#m-add').textContent = actual && carrito[actual.id] ? 'Quitar del pedido' : 'Agregar al pedido'; }
$('#m-add').onclick = function(){ toggleCarrito(actual); pintarModalAdd(); render(); };
modal.addEventListener('click', function(e){ if (e.target === modal || e.target.hasAttribute('data-close')) modal.close(); });

/* ---------- zoom y deslizar en la vista rápida ---------- */
var stage = $('#m-img'), wrap = $('#m-wrap'), Z = { z:1, x:0, y:0 };
function zoomAplicar(){
  var w = wrap.clientWidth, h = wrap.clientHeight, mx = w * (Z.z - 1) / 2, my = h * (Z.z - 1) / 2;
  Z.x = Math.max(-mx, Math.min(mx, Z.x)); Z.y = Math.max(-my, Math.min(my, Z.y));
  stage.style.transform = 'translate(' + Z.x + 'px,' + Z.y + 'px) scale(' + Z.z + ')';
  wrap.classList.toggle('zoomed', Z.z > 1);
  $('#z-val').textContent = Math.round(Z.z * 100) + '%';
  $('#z-out').disabled = Z.z <= 1; $('#z-in').disabled = Z.z >= 4;
}
function zoomA(z){ Z.z = Math.max(1, Math.min(4, z)); if (Z.z === 1) { Z.x = Z.y = 0; } zoomAplicar(); }
function zoomReset(){ Z.z = 1; Z.x = Z.y = 0; zoomAplicar(); }
$('#z-in').onclick = function(){ zoomA(Z.z + .5); };
$('#z-out').onclick = function(){ zoomA(Z.z - .5); };
$('#z-reset').onclick = zoomReset;
wrap.addEventListener('wheel', function(e){ e.preventDefault(); zoomA(Z.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive:false });
wrap.addEventListener('dblclick', function(e){ if (e.target.closest('button')) return; zoomA(Z.z > 1 ? 1 : 2.5); });
function pasarFoto(paso){
  var i = vista.indexOf(actual); if (i < 0 || vista.length < 2) return;
  abrirModal(vista[(i + paso + vista.length) % vista.length]);
  stage.classList.remove('slide-l', 'slide-r'); void stage.offsetWidth; stage.classList.add(paso > 0 ? 'slide-l' : 'slide-r');
}
$('#m-prev').onclick = function(){ pasarFoto(-1); };
$('#m-next').onclick = function(){ pasarFoto(1); };
modal.addEventListener('keydown', function(e){
  if (e.key === 'ArrowLeft') pasarFoto(-1); else if (e.key === 'ArrowRight') pasarFoto(1);
  else if (e.key === '+' || e.key === '=') zoomA(Z.z + .5); else if (e.key === '-') zoomA(Z.z - .5);
});
/* arrastrar: con zoom mueve la foto, sin zoom desliza a la siguiente */
var drag = null;
wrap.addEventListener('pointerdown', function(e){
  if (e.target.closest('button')) return;
  drag = { x:e.clientX, y:e.clientY, ox:Z.x, oy:Z.y }; wrap.setPointerCapture(e.pointerId); wrap.classList.add('dragging');
});
wrap.addEventListener('pointermove', function(e){
  if (!drag) return;
  var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Z.z > 1) { Z.x = drag.ox + dx; Z.y = drag.oy + dy; zoomAplicar(); }
  else stage.style.transform = 'translateX(' + dx * .6 + 'px)';
});
function soltar(e){
  if (!drag) return;
  var dx = e.clientX - drag.x; drag = null; wrap.classList.remove('dragging');
  if (Z.z === 1) { stage.style.transform = ''; if (Math.abs(dx) > 60) pasarFoto(dx < 0 ? 1 : -1); }
}
wrap.addEventListener('pointerup', soltar);
wrap.addEventListener('pointercancel', soltar);
window.addEventListener('resize', function(){ if (modal.open) zoomAplicar(); });

/* ---------- pedido (carrito por WhatsApp) ---------- */
var carrito = {};
try { carrito = JSON.parse(localStorage.getItem('cripta-pedido')) || {}; } catch(e) {}
function guardarCarrito(){ try { localStorage.setItem('cripta-pedido', JSON.stringify(carrito)); } catch(e) {} }
function toggleCarrito(p){
  if (carrito[p.id]) { delete carrito[p.id]; toast('Quitado del pedido'); }
  else { carrito[p.id] = 1; toast('Agregado: ' + p.modelo); }
  guardarCarrito(); pintarCarrito(true);
}
function pintarCarrito(animar){
  var items = Object.keys(carrito).map(function(id){ return STOCK.filter(function(p){ return p.id === id && p.estado !== 'vendida'; })[0]; }).filter(Boolean);
  var n = $('#cart-count'); n.hidden = !items.length; n.textContent = items.length;
  if (animar) { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
  var list = $('#cart-list'); list.innerHTML = '';
  if (!items.length) list.innerHTML = '<p class="drawer-empty">Todavía no agregaste nada.<br>Tocá el <b>+</b> en un producto.</p>';
  items.forEach(function(p){
    var d = document.createElement('div'); d.className = 'line-item';
    d.innerHTML = '<div class="li-img"></div><div><b></b><small>' + pesos(p.precio) + '</small></div><button type="button" aria-label="Quitar">✕</button>';
    $('b', d).textContent = p.marca + ' ' + p.modelo;
    imagen($('.li-img', d), p);
    $('button', d).onclick = function(){ delete carrito[p.id]; guardarCarrito(); pintarCarrito(); render(); };
    list.appendChild(d);
  });
  var total = items.reduce(function(s,p){ return s + p.precio; }, 0);
  $('#cart-total').textContent = pesos(total);
  var msg = 'Hola CRIPTA! Quiero consultar por:\n' + items.map(function(p){ return '• ' + p.marca + ' ' + p.modelo + ' — ' + pesos(p.precio); }).join('\n') + '\nTotal: ' + pesos(total) + '\n¿Está todo disponible?';
  var send = $('#cart-send'); send.href = linkWA(msg); send.hidden = !items.length;
}
var drawer = $('#drawer'), scrim = $('#scrim');
function abrirDrawer(v){ drawer.classList.toggle('open', v); drawer.setAttribute('aria-hidden', !v); scrim.hidden = !v; }
$('#cart-open').onclick = function(){ abrirDrawer(true); };
$('#cart-close').onclick = scrim.onclick = function(){ abrirDrawer(false); };
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') abrirDrawer(false); });

var toastT;
function toast(t){ var el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function(){ el.classList.remove('show'); }, 2000); }

/* ---------- destacadas ---------- */
var dest = [], di = 0, timer;
function verDest(i){
  di = i; var p = dest[i], box = $('#f-img');
  box.innerHTML = ''; imagen(box, p, true);
  box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  $('#f-sub').textContent = [p.marca, p.memoria, p.categoria === 'gpu' && p.uso ? 'hasta ' + p.uso : ''].filter(Boolean).join(' · ');
  $('#f-name').textContent = nombreLimpio(p);
  $('#f-price').innerHTML = precioHTML(p, 'now');
  $('#f-tag').textContent = p.oferta ? 'Oferta' : 'Destacada';
  $('#f-tag').className = 'pill ' + (p.oferta ? 'pill-hot' : 'pill-y');
  $$('#dots button').forEach(function(b, j){ b.setAttribute('aria-current', j === i); });
}
function armarDestacadas(){
  var disp = disponibles();
  dest = disp.filter(function(p){ return p.oferta; }).concat(disp.filter(function(p){ return p.destacada && !p.oferta; }));
  if (dest.length < 3) dest = dest.concat(disp.slice().sort(function(a,b){ return b.precio - a.precio; }).filter(function(p){ return dest.indexOf(p) < 0 && p.categoria === 'gpu'; }).slice(0, 4 - dest.length));
  if (!dest.length) { $('#feature').hidden = true; return; }
  $('#dots').innerHTML = '';
  dest.forEach(function(p, i){
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Ver ' + p.modelo);
    b.onclick = function(){ clearInterval(timer); verDest(i); }; $('#dots').appendChild(b);
  });
  $('#f-prev').hidden = $('#f-next').hidden = dest.length < 2;
  verDest(0);
  if (dest.length > 1 && !reduce) timer = setInterval(function(){ verDest((di + 1) % dest.length); }, 5000);
  $('#f-img').onclick = function(){ abrirModal(dest[di]); };
  $('#f-img').style.cursor = 'zoom-in';
}
function mover(d){ clearInterval(timer); verDest((di + d + dest.length) % dest.length); }
$('#f-prev').onclick = function(){ mover(-1); };
$('#f-next').onclick = function(){ mover(1); };

/* inclinación 3D de la tarjeta destacada */
var card = $('#feature-card');
if (!reduce && matchMedia('(hover:hover)').matches) {
  card.addEventListener('mousemove', function(e){
    var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.transform = 'rotateY(' + ((x - .5) * 12) + 'deg) rotateX(' + ((.5 - y) * 10) + 'deg)';
    card.style.setProperty('--sx', x * 100 + '%'); card.style.setProperty('--sy', y * 100 + '%');
  });
  card.addEventListener('mouseleave', function(){ card.style.transform = ''; });
  var hero = $('.hero');
  hero.addEventListener('mousemove', function(e){
    var r = hero.getBoundingClientRect();
    hero.style.setProperty('--mx', (e.clientX - r.left) + 'px'); hero.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
}

/* luz amarilla que sigue al mouse en toda la página + brillo en el borde de cada tarjeta */
if (!reduce && matchMedia('(hover:hover)').matches) {
  var luz = document.createElement('div'); luz.className = 'cursor-light'; luz.setAttribute('aria-hidden', 'true');
  document.body.appendChild(luz);
  var tx = innerWidth / 2, ty = innerHeight / 3, lx = tx, ly = ty, mov = false;
  addEventListener('pointermove', function(e){
    tx = e.clientX; ty = e.clientY;
    if (!mov) { mov = true; luz.classList.add('on'); requestAnimationFrame(seguir); }
    var el = e.target.closest && e.target.closest('.card,.perk,.cat,.step,.faq details,.sell,.sold,.feature-card,.cta-final,.search,.tab,.ig-grid a');
    if (el) { var r = el.getBoundingClientRect(); el.style.setProperty('--px', (e.clientX - r.left) + 'px'); el.style.setProperty('--py', (e.clientY - r.top) + 'px'); }
  }, { passive:true });
  document.addEventListener('pointerleave', function(){ luz.classList.remove('on'); });
  function seguir(){
    lx += (tx - lx) * .14; ly += (ty - ly) * .14;
    luz.style.transform = 'translate(' + lx + 'px,' + ly + 'px)';
    if (Math.abs(tx - lx) + Math.abs(ty - ly) > .5) requestAnimationFrame(seguir); else mov = false;
  }
}
/* barra de progreso de lectura */
var prog = document.createElement('div'); prog.className = 'progress'; document.body.appendChild(prog);
addEventListener('scroll', function(){ var h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = 'scaleX(' + (h > 0 ? scrollY / h : 0) + ')'; }, { passive:true });

/* ---------- vendidas ---------- */
function armarVendidas(){
  var v = STOCK.filter(function(p){ return p.estado === 'vendida'; });
  if (!v.length) { $('.sold-strip').hidden = true; return; }
  var html = '';
  v.forEach(function(p){ html += '<div class="sold" data-id="' + esc(p.id) + '"><div class="sold-img"></div><div><small>VENDIDA ✓</small><b></b></div></div>'; });
  var t = $('#vendidas'); t.innerHTML = html + html;
  $$('.sold', t).forEach(function(el, i){ var p = v[i % v.length]; $('b', el).textContent = p.marca + ' ' + nombreLimpio(p); imagen($('.sold-img', el), p); });
}

/* ---------- contadores ---------- */
function contar(el, hasta){
  if (reduce || !hasta) { el.textContent = hasta.toLocaleString('es-AR'); return; }
  var t0 = null, dur = 1400;
  function paso(t){ if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(hasta * e).toLocaleString('es-AR'); if (k < 1) requestAnimationFrame(paso); }
  requestAnimationFrame(paso);
}

/* ---------- aparición al scrollear ---------- */
var io = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){
  es.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { rootMargin:'0px 0px -8% 0px' }) : null;
function observar(){ $$('.reveal:not(.in)').forEach(function(el){ if (io) io.observe(el); else el.classList.add('in'); }); }

/* ---------- header / menú ---------- */
var header = $('#header');
addEventListener('scroll', function(){ header.classList.toggle('scrolled', scrollY > 10); }, { passive:true });
var menuBtn = $('#menu-btn'), links = $('#nav-links');
menuBtn.onclick = function(){ var o = !links.classList.contains('open'); links.classList.toggle('open', o); menuBtn.setAttribute('aria-expanded', o); };
$$('a', links).forEach(function(a){ a.addEventListener('click', function(){ links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', false); }); });

/* ---------- filtros ---------- */
$('#q').oninput = function(e){ estado.q = e.target.value.trim().toLowerCase(); render(); };
$('#orden').onchange = function(e){ estado.orden = e.target.value; render(); };
$$('#res button').forEach(function(b){
  b.setAttribute('aria-pressed', b.dataset.res === '');
  b.onclick = function(){ estado.res = b.dataset.res; $$('#res button').forEach(function(x){ x.setAttribute('aria-pressed', x === b); }); render(); };
});

/* ---------- formulario de venta ---------- */
$('#sell-form').addEventListener('submit', function(e){
  e.preventDefault();
  var g = function(id){ return $('#' + id).value; };
  var fin = $('input[name="s-fin"]:checked').value;
  var msg = 'Hola! ' + fin + '.\n• ' + g('s-tipo') + ': ' + g('s-modelo') + '\n• Estado: ' + g('s-estado') + '\n• Uso: ' + g('s-uso') + '\n¿Cuánto me ofrecen?';
  window.open(linkWA(msg), '_blank', 'noopener');
});

/* ---------- arranque ---------- */
cargarContenido().then(function(c){
  C = c; pintarTextos(); observar();
  return cargarStock();
}).then(function(lista){
  STOCK = lista;
  armarCategorias(); armarTabs(); render(); armarDestacadas(); armarVendidas(); pintarCarrito(); observar();
  contar($('#stat-stock'), disponibles().length);
  contar($('#stat-vendidas'), STOCK.filter(function(p){ return p.estado === 'vendida'; }).length);
  var ig = Number((C.ajustes || {}).seguidoresInstagram) || 0;
  if (ig) contar($('#stat-ig'), ig); else $('#stat-ig').parentNode.parentNode.hidden = true;
}).catch(function(err){
  console.error('[cripta]', err);
  $('#productos').innerHTML = '<div class="empty">No pudimos cargar el stock. <a target="_blank" rel="noopener" href="https://wa.me/5493816260646">Escribinos por WhatsApp</a>.</div>';
});

})();
