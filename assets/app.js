let PRODUTOS = [];
const PMAP = {};
let COD_ANTIGO = {};
let COD_NOVO_ANTIGO = {};


let UF='', POLITICA=null, TABELA=null, PERFIL=null, REP=null, REP_IMG='', PRESTO_IMG='';
let policy = {tipo:'revenda', volume:'normal', pgto:'avista', gerencial:false, incentivoOn:true};
let items = [];
let nid = 1;
let sortDir = 0;
let dragSrc = null, dragEl = null;
// (multi-select removido — agora usa clique / pressionar-e-segurar)
let suppressAutosave = false;

// ── PRICE CALC ──
// Order (multiplicative): base -> ICMS 14% (automatico, item com origem 1) -> incentivo adicional 10% (toggle, item marcado)
// -> volume atacado -10% -> pagamento -> desconto gerencial -5%
function calcOpts(){ return {tipo:policy.tipo, volume:policy.volume, pgto:policy.pgto, gerencial:policy.gerencial, linhaOn:policy.incentivoOn}; }
function baseP(prod){ return PrestoCalc.precoBase(prod, policy.tipo, PERFIL); }
function calcUnit(prod){ return PrestoCalc.precoUnitario(prod, calcOpts(), POLITICA, PERFIL); }
function hasLinha(p){ return !!(p.linha && POLITICA.linhas[p.linha]); }
function impPct(p){
  if(!p.importado) return 0;
  return policy.tipo==='consumo' ? PERFIL.adicional_importados_consumo : PERFIL.adicional_importados_revenda;
}

const fmt = v => 'R$ ' + v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function fmtIpiPct(v){ return '+' + (v*100).toLocaleString('pt-BR',{maximumFractionDigits:2}) + '% IPI'; }

// ── THEME ──
function applyTheme(t){
  document.documentElement.classList.toggle('light', t==='light');
  document.getElementById('btn-theme').textContent = t==='light' ? '☀' : '🌙';
  localStorage.setItem('presto_theme', t);
}
(function initTheme(){
  const saved = localStorage.getItem('presto_theme') || 'dark';
  applyTheme(saved);
})();
function toggleTheme(){
  const cur = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  applyTheme(cur==='light' ? 'dark' : 'light');
}

// ── POLICY ──
function togglePolicy(){ document.getElementById('policy-panel').classList.toggle('open'); }
function setP(k,v){
  policy[k]=v;
  if(k==='tipo'){['revenda','consumo','tabela'].forEach(x=>document.getElementById('btn-'+x).classList.toggle('active',x===v));}
  if(k==='volume'){['normal','atacado'].forEach(x=>document.getElementById('btn-'+x).classList.toggle('active',x===v));}
  if(k==='pgto'){['avista','boleto','none'].forEach(x=>document.getElementById('btn-'+x).classList.toggle('active',x===v));}
  updateBadges(); renderTable(); saveDraft();
}
function toggleGerencial(){
  policy.gerencial = !policy.gerencial;
  document.getElementById('btn-ger').classList.toggle('active', policy.gerencial);
  document.getElementById('btn-ger').classList.toggle('ger', policy.gerencial);
  updateBadges(); renderTable(); saveDraft();
}
function toggleIncentivo(){
  policy.incentivoOn = !policy.incentivoOn;
  updateIncentivoBtn();
  updateBadges(); renderTable(); saveDraft();
}
function cartHasIncentiveItems(){
  return items.some(it=>hasLinha(it.prod));
}
function updateIncentivoBtn(){
  const btn = document.getElementById('btn-inc-toggle');
  if(cartHasIncentiveItems()){
    btn.style.display='';
    const lp = Math.round(Object.values(POLITICA.linhas)[0].desconto*100);
    btn.textContent = policy.incentivoOn ? `✓ Incentivo ${lp}% ativo` : `Incentivo ${lp}% desligado`;
    btn.classList.toggle('inc-on', policy.incentivoOn);
  } else {
    btn.style.display='none';
  }
}

// cycle helpers for clickable badges
function cycleTipo(){
  const order=['revenda','consumo','tabela'];
  setP('tipo', order[(order.indexOf(policy.tipo)+1)%order.length]);
}
function cycleVolume(){ setP('volume', policy.volume==='normal' ? 'atacado':'normal'); }
function cyclePgto(){
  const order=['avista','boleto','none'];
  const next = order[(order.indexOf(policy.pgto)+1)%order.length];
  setP('pgto', next);
}

function updateBadges(){
  const t=policy.tipo==='revenda'?'Revenda':policy.tipo==='consumo'?'Consumo':'Tabela (bruto)';
  const v=policy.volume==='atacado'?'Atacado −10%':'Normal';
  const pg=policy.pgto==='avista'?'À Vista −5%':policy.pgto==='boleto'?'Boleto −3%':'Sem desc.';
  const ger = policy.gerencial ? `<span class="badge inc-on" onclick="toggleGerencial()">Gerencial −5%</span>` : '';
  document.getElementById('pbadges').innerHTML =
    `<span class="badge" onclick="cycleTipo()" title="Clique para alternar">${t}</span>` +
    `<span class="badge ${policy.volume==='normal'?'dim':''}" onclick="cycleVolume()" title="Clique para alternar">${v}</span>` +
    `<span class="badge ${policy.pgto==='none'?'dim':''}" onclick="cyclePgto()" title="Clique para alternar">${pg}</span>` +
    ger;
  document.getElementById('btn-ger').classList.toggle('active', policy.gerencial);
  document.getElementById('btn-ger').classList.toggle('ger', policy.gerencial);
  updateIncentivoBtn();
}

// ── SEARCH ──
function searchProducts(q){
  q = q.trim().toLowerCase();
  if(!q) return [];
  // código antigo (exato) → mostra o(s) código(s) novo(s) primeiro
  const viaAntigo = (COD_ANTIGO[q]||[]).map(c=>PMAP[c]).filter(Boolean);
  const rest = PRODUTOS.filter(p => !viaAntigo.includes(p) && (p.cod.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)));
  return viaAntigo.concat(rest).slice(0,40);
}
function renderPreview(list){
  const box = document.getElementById('preview-box');
  if(!list.length){ box.innerHTML = '<div class="pi-empty">Nenhum produto encontrado.</div>'; box.classList.add('open'); return; }
  box.innerHTML = list.map(p=>{
    const inCart = items.some(it=>it.prod.cod===p.cod);
    const unit = calcUnit(p);
    const incBadge = hasLinha(p) ? `<span class="pi-incbadge">${Math.round(POLITICA.linhas[p.linha].desconto*100)}%</span>` : '';
    const qv = document.getElementById('si').value.trim().toLowerCase();
    const oldBadge = (COD_NOVO_ANTIGO[p.cod] && COD_NOVO_ANTIGO[p.cod]===qv) ? `<span class="pi-oldbadge">antigo ${qv}</span>` : '';
    const addedTag = inCart ? '<span class="pi-addedtag">✓ no orç.</span>' : '';
    return `<div class="pi ${inCart?'in-cart':''}" data-cod="${p.cod}"
      onmousedown="piPressStart('${p.cod}')" onmouseup="piPressEnd('${p.cod}')" onmouseleave="piPressCancel()"
      ontouchstart="piPressStart('${p.cod}')" ontouchend="piPressEnd('${p.cod}')" ontouchcancel="piPressCancel()">
      <span class="pi-cod">${p.cod}</span>
      <span class="pi-desc">${p.descricao}${oldBadge}${incBadge}${addedTag}</span>
      <span class="pi-price">${fmt(unit)}</span>
    </div>`;
  }).join('');
  box.classList.add('open');
}
let piPressTimer=null, piPressLong=false, piPressCod=null;
function piPressStart(cod){
  piPressCod=cod; piPressLong=false;
  clearTimeout(piPressTimer);
  piPressTimer=setTimeout(()=>{
    piPressLong=true;
    addItem(cod);
    const list = searchProducts(document.getElementById('si').value);
    renderPreview(list);
    if(navigator.vibrate) navigator.vibrate(25);
  }, 480);
}
function piPressEnd(cod){
  clearTimeout(piPressTimer);
  if(!piPressLong && cod===piPressCod){ quickAdd(cod); }
  piPressLong=false; piPressCod=null;
}
function piPressCancel(){
  clearTimeout(piPressTimer);
  piPressLong=false; piPressCod=null;
}
function onSI(){ renderPreview(searchProducts(document.getElementById('si').value)); }
function onSK(e){ if(e.key==='Enter'){ addFromSearch(); } }
function openPrev(){ renderPreview(searchProducts(document.getElementById('si').value)); }
function addFromSearch(){
  const v = document.getElementById('si').value.trim();
  if(!v) return;
  const list = searchProducts(v);
  if(list.length===1){ addItem(list[0].cod); document.getElementById('si').value=''; document.getElementById('preview-box').classList.remove('open'); }
  else if(list.length>1){ renderPreview(list); }
}
function quickAdd(cod){ addItem(cod); document.getElementById('si').value=''; document.getElementById('preview-box').classList.remove('open'); }

function addItem(cod){
  const p = PMAP[cod]; if(!p) return;
  const existing = items.find(it=>it.prod.cod===cod);
  if(existing){ existing.qty += p.mult_vda; }
  else { items.push({id:nid++, prod:p, qty:p.mult_vda}); }
  renderTable(); saveDraft();
}
function delItem(id){ items = items.filter(it=>it.id!==id); renderTable(); saveDraft(); }
function setQty(id, val){
  const it = items.find(x=>x.id===id); if(!it) return;
  const n = parseInt(val,10);
  it.qty = isNaN(n)||n<1 ? it.prod.mult_vda : n;
  renderTable(); saveDraft();
}

// ── SORT ──
function toggleSort(){
  sortDir = sortDir===0?1:sortDir===1?-1:0;
  document.getElementById('sort-btn').textContent = sortDir===1?'↑ Valor':sortDir===-1?'↓ Valor':'↕ Ordem';
  renderTable();
}

// ── DRAG & DROP reorder ──
function onDragStart(e, id){ dragSrc=id; dragEl=e.currentTarget; e.currentTarget.classList.add('dragging'); }
function onDragOver(e){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function onDrop(e, id){
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if(dragSrc===id) return;
  const srcIdx = items.findIndex(it=>it.id===dragSrc);
  const dstIdx = items.findIndex(it=>it.id===id);
  const [moved] = items.splice(srcIdx,1);
  items.splice(dstIdx,0,moved);
  renderTable(); saveDraft();
}
function onDragEnd(e){ e.currentTarget.classList.remove('dragging'); }

// ── RENDER TABLE ──
function renderTable(){
  const tbody = document.getElementById('tbody');
  const emptySt = document.getElementById('empty-st');
  if(!items.length){ tbody.innerHTML=''; emptySt.style.display='block'; document.getElementById('bt').style.display='none'; updateTotals(); updateIncentivoBtn(); return; }
  emptySt.style.display='none'; document.getElementById('bt').style.display='table';

  let renderItems = items.slice();
  if(sortDir!==0){
    renderItems.sort((a,b)=>{
      const ta = calcUnit(a.prod)*a.qty, tb = calcUnit(b.prod)*b.qty;
      return sortDir===1 ? ta-tb : tb-ta;
    });
  }

  tbody.innerHTML = renderItems.map(it=>{
    const p = it.prod;
    const unit = calcUnit(p), unitIpi = unit*(1+p.ipi);
    const total = unit*it.qty, totalIpi = unitIpi*it.qty;
    const qBad = it.qty % p.mult_vda !== 0;
    const ipiStr = fmtIpiPct(p.ipi);
    const incTag = (hasLinha(p) && policy.incentivoOn) ? `<span class="inc-tag">−${Math.round(POLITICA.linhas[p.linha].desconto*100)}% ${POLITICA.linhas[p.linha].nome.toLowerCase()}</span>` : '';
    const ip = impPct(p); const icmsTag = ip>0 ? `<span class="icms-tag">Importado −${Math.round(ip*100)}%</span>` : '';
    return `<tr class="item-row ${(hasLinha(p)&&policy.incentivoOn)?'has-inc':''}" draggable="true" data-id="${it.id}"
      ondragstart="onDragStart(event,${it.id})" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)"
      ondrop="onDrop(event,${it.id})" ondragend="onDragEnd(event)">
      <td class="cell-cod">${p.cod}</td>
      <td class="cell-desc">${p.descricao}${icmsTag}${incTag}</td>
      <td class="cell-qty"><input type="text" inputmode="numeric" class="${qBad?'inv':''}" value="${it.qty}"
        onchange="setQty(${it.id}, this.value)"></td>
      <td class="cell-unit">${p.und} ×${p.mult_vda}</td>
      <td class="cell-price">
        <div class="price-main">${fmt(unit)}</div>
        <div class="price-sub">${ipiStr} · c/IPI ${fmt(unitIpi)}</div>
      </td>
      <td class="cell-total">
        <div class="total-main">${fmt(total)}</div>
        <div class="total-sub">c/IPI ${fmt(totalIpi)}</div>
      </td>
      <td class="cell-act"><button class="btn-del" onclick="delItem(${it.id})">✕</button></td>
    </tr>`;
  }).join('');

  updateTotals();
  updateIncentivoBtn();
}

function updateTotals(){
  let sub=0, afterPolicy=0, ipiAmt=0;
  items.forEach(it=>{
    const b = baseP(it.prod);
    const u = calcUnit(it.prod);
    sub += b*it.qty;
    afterPolicy += u*it.qty;
    ipiAmt += u*it.prod.ipi*it.qty;
  });
  document.getElementById('t-items').textContent = items.reduce((a,it)=>a+it.qty,0);
  document.getElementById('t-sub').textContent = fmt(sub);
  document.getElementById('t-disc').textContent = '−'+fmt(sub-afterPolicy);
  document.getElementById('t-final').textContent = fmt(afterPolicy);
  document.getElementById('t-ipi').textContent = '+ '+fmt(ipiAmt);
  document.getElementById('t-grand').textContent = fmt(afterPolicy+ipiAmt);
}

// ── CLEAR ──
function confirmClear(){
  document.getElementById('mo-title').textContent='Limpar Orçamento';
  document.getElementById('mo-text').innerHTML='Todos os itens serão removidos.<br>Esta ação não pode ser desfeita.';
  document.getElementById('mo-btns').innerHTML = `<button class="mbtn mc" onclick="closeModal()">Cancelar</button><button class="mbtn mk" onclick="doClear()">Limpar Tudo</button>`;
  document.getElementById('mo').classList.add('open');
}
function closeModal(){ document.getElementById('mo').classList.remove('open'); }
function doClear(){ items=[]; document.getElementById('cname').value=''; renderTable(); closeModal(); saveDraft(); }

// ── AUTOSAVE / DRAFT RESTORE ──
let DRAFT_KEY = 'presto_draft_v2';
function saveDraft(){
  if(suppressAutosave) return;
  try{
    const draft = {
      items: items.map(it=>({cod:it.prod.cod, qty:it.qty, id:it.id})),
      policy, client: document.getElementById('cname') ? document.getElementById('cname').value : '',
      nid, ts: Date.now()
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }catch(e){}
}
function loadDraftIfAny(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return;
    const draft = JSON.parse(raw);
    if(!draft.items || !draft.items.length) return;
    document.getElementById('restore-banner').classList.add('show');
    window.__pendingDraft = draft;
  }catch(e){}
}
function restoreDraft(){
  const draft = window.__pendingDraft; if(!draft) return;
  suppressAutosave = true;
  items = draft.items.map(d=>({id:d.id, qty:d.qty, prod:PMAP[d.cod]})).filter(it=>it.prod);
  nid = draft.nid || (Math.max(0,...items.map(i=>i.id))+1);
  policy = Object.assign(policy, draft.policy||{});
  document.getElementById('cname').value = draft.client || '';
  ['tipo','volume','pgto'].forEach(k=>setP(k,policy[k]));
  document.getElementById('btn-ger').classList.toggle('active', policy.gerencial);
  document.getElementById('btn-ger').classList.toggle('ger', policy.gerencial);
  suppressAutosave = false;
  updateBadges(); renderTable(); saveDraft();
  document.getElementById('restore-banner').classList.remove('show');
}
function discardDraft(){
  localStorage.removeItem(DRAFT_KEY);
  document.getElementById('restore-banner').classList.remove('show');
}
// ── PDF EXPORT ──
function savePDF(){
  if(!items.length){ alert('Adicione ao menos um item ao orçamento.'); return; }
  const client = document.getElementById('cname').value.trim() || 'Cliente';
  const now = new Date();
  const dLabel = now.toLocaleDateString('pt-BR');
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const fname = `${yy}${mm}${dd} ${client} Orç P`;

  let sub=0, afterPolicy=0, ipiAmt=0;
  items.forEach(it=>{
    const b = baseP(it.prod), u = calcUnit(it.prod);
    sub += b*it.qty; afterPolicy += u*it.qty; ipiAmt += u*it.prod.ipi*it.qty;
  });
  const fin = afterPolicy;
  const polDiscAmt = sub - afterPolicy;

  const rows = items.map((it,i)=>{
    const p=it.prod;
    const unit=calcUnit(p), unitIpi=unit*(1+p.ipi);
    const total=unit*it.qty, totalIpi=unitIpi*it.qty;
    const qBad=it.qty%p.mult_vda!==0;
    const ipiStr=fmtIpiPct(p.ipi);
    const codColor=PMAP[p.cod]?'#FF6B00':'#cc0000';
    return `<tr>
      <td style="text-align:center;color:#aaa;font-size:10px">${i+1}</td>
      <td style="color:${codColor};font-weight:700;font-family:monospace;font-size:11px">${p.cod}</td>
      <td>${p.descricao}</td>
      <td style="text-align:center;font-size:10px;color:#777">${p.ncm||'—'}</td>
      <td style="text-align:center;color:${qBad?'#cc0000':'inherit'}">${it.qty}</td>
      <td style="text-align:center;color:#888;font-size:10px">${p.und} ×${p.mult_vda}</td>
      <td style="text-align:right">
        <strong style="color:#27ae60">${fmt(unit)}</strong>
        <span style="color:#4a90d9;font-size:9px;margin-left:3px;border:1px solid #4a90d9;padding:0 3px;border-radius:2px">${ipiStr}</span>
        <br><span style="color:#aaa;font-size:9px">c/IPI: ${fmt(unitIpi)}</span>
      </td>
      <td style="text-align:right">
        <strong>${fmt(total)}</strong>
        <br><span style="color:#aaa;font-size:9px">c/IPI: ${fmt(totalIpi)}</span>
      </td>
    </tr>`;
  }).join('');

  // ── código secreto da política, embutido discretamente na "Tabela Base" ──
  // 1) R=Revenda / C=Consumo  2) N=Normal / A=Atacado  3) V=À vista / B=Boleto / S=Sem desconto  4) G=Gerencial aplicado / vazio
  const c1 = policy.tipo==='revenda' ? 'R' : policy.tipo==='consumo' ? 'C' : 'T';
  const c2 = policy.volume==='atacado' ? 'A' : 'N';
  const c3 = policy.pgto==='avista' ? 'V' : policy.pgto==='boleto' ? 'B' : 'S';
  const c4 = policy.gerencial ? 'G' : '';
  const policyCode = UF+'-'+c1+c2+c3+c4;

  const pLbl = policy.pgto==='avista' ? 'À vista' : policy.pgto==='boleto' ? PERFIL.boleto_label : 'A combinar';

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${fname}</title>
  <style>
    @page{size:A4 landscape;margin:8mm;}
    body{font-family:Arial,sans-serif;background:#fff;color:#111;margin:0;padding:14mm 16mm;font-size:11px;}
    .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:3px solid #FF6B00;padding-bottom:8px;}
    .logos{display:flex;align-items:center;gap:14px;}
    .logos img.presto{height:38px;object-fit:contain;}
    .logos img.vidal{height:50px;object-fit:contain;}
    .sep{width:1px;height:36px;background:#ddd;}
    .meta{text-align:right;color:#666;font-size:10px;line-height:1.7;}
    .cl{font-size:13px;font-weight:700;color:#111;}
    .tablebase{font-size:9px;color:#bbb;}
    .paycond{display:inline-block;background:#FFF3E8;border:1px solid #FF6B00;color:#FF6B00;font-size:11px;font-weight:700;padding:4px 12px;border-radius:6px;margin-bottom:8px;}
    table{width:100%;border-collapse:collapse;}
    th{background:#FF6B00;color:#fff;padding:5px 7px;text-align:left;font-size:10px;}
    td{padding:4px 7px;border-bottom:1px solid #eee;vertical-align:middle;line-height:1.4;}
    tr:nth-child(even) td{background:#fafafa;}
    .tw{display:flex;justify-content:flex-end;margin-top:10px;}
    .tb{border:1px solid #ddd;border-radius:6px;overflow:hidden;min-width:320px;}
    .tr{display:flex;justify-content:space-between;padding:5px 13px;font-size:11px;border-bottom:1px solid #eee;}
    .tr:last-child{border-bottom:none;}
    .tr.hl{background:#FFF3E8;font-size:13px;font-weight:900;color:#FF6B00;}
    .tr.bi{background:#EEF4FF;color:#2255aa;font-size:12px;font-weight:700;}
    .tr.gr{background:#1a2a4a;color:#fff;font-size:15px;font-weight:900;}
    .ft{margin-top:10px;text-align:center;font-size:9px;color:#ccc;border-top:1px solid #eee;padding-top:6px;}
  </style></head><body>
  <div class="hdr">
    <div class="logos">
      <img class="presto" src="${PRESTO_IMG}" alt="PRESTO">
      ${REP_IMG ? `<div class="sep"></div><img class="vidal" src="${REP_IMG}" alt="${REP.nome}">` : ''}
    </div>
    <div class="meta">
      <div class="cl">Cliente: ${client}</div>
      <div>Data: ${dLabel}</div>
      <div class="tablebase">Tabela Base ${TABELA.tabela} - ${policyCode} - Atualização ${dLabel}</div>
    </div>
  </div>
  <div class="paycond">Condição de pagamento: ${pLbl}</div>
  <table><thead><tr>
    <th style="width:22px">#</th>
    <th style="width:55px">Código</th>
    <th>Descrição</th>
    <th style="width:72px;text-align:center">NCM</th>
    <th style="width:40px;text-align:center">Qtd</th>
    <th style="width:55px;text-align:center">Unid</th>
    <th style="width:128px;text-align:right">Preço Unit.</th>
    <th style="width:118px;text-align:right">Total</th>
  </tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="tw"><div class="tb">
    <div class="tr"><span>Subtotal base:</span><span>${fmt(sub)}</span></div>
    <div class="tr" style="color:#27ae60"><span>Descontos aplicados:</span><span>−${fmt(polDiscAmt)}</span></div>
    <div class="tr hl"><span>TOTAL s/ IPI:</span><span>${fmt(fin)}</span></div>
    <div class="tr bi"><span>IPI do pedido:</span><span>+ ${fmt(ipiAmt)}</span></div>
    <div class="tr gr"><span>TOTAL c/ IPI:</span><span>${fmt(fin+ipiAmt)}</span></div>
  </div></div>
  <div class="ft">${REP ? REP.nome + ' – ' : ''}PRESTO | Tabela de Preços ${TABELA.tabela} | ${UF}</div>
  </body></html>`;

  const win=window.open('','_blank');
  win.document.write(html);
  win.document.close();
  win.document.title=fname;
  setTimeout(()=>{win.focus();win.print();},600);
}

// ── INIT ──
document.addEventListener('click',e=>{
  const sw=document.getElementById('sw');
  if(sw && !sw.contains(e.target)) document.getElementById('preview-box').classList.remove('open');
});
document.getElementById('cname').addEventListener('input', saveDraft);

function toDataURL(url){
  return fetch(url).then(r=>r.blob()).then(b=>new Promise(res=>{const f=new FileReader(); f.onload=()=>res(f.result); f.readAsDataURL(b);})).catch(()=>'');
}

async function boot(){
  const qs = new URLSearchParams(location.search);
  UF = (qs.get('uf')||'').toUpperCase();
  const repId = (qs.get('rep')||'').toLowerCase();
  let pol, tab, antigos, reps;
  try{
    [pol, tab, antigos, reps] = await Promise.all([
      fetch('../data/politica.json').then(r=>r.json()),
      fetch('../data/precos.json').then(r=>r.json()),
      fetch('../data/codigos_antigos.json').then(r=>r.json()),
      fetch('../data/representantes.json').then(r=>r.json()).catch(()=>({}))
    ]);
  }catch(e){
    document.body.innerHTML='<div style="padding:40px;font-family:sans-serif;color:#ccc">Não consegui carregar os dados. Conecte-se à internet ao menos uma vez para o app ficar disponível offline.</div>';
    return;
  }
  POLITICA = pol; TABELA = tab;
  PERFIL = PrestoCalc.perfilDaUF(pol, UF);
  if(!PERFIL){ location.replace('../' + (repId ? '?rep='+repId : '') + '#trocar'); return; }
  PRODUTOS = tab.itens; PRODUTOS.forEach(p=>PMAP[p.cod]=p);
  COD_ANTIGO = antigos; COD_NOVO_ANTIGO = {};
  Object.keys(COD_ANTIGO).forEach(o=>COD_ANTIGO[o].forEach(n=>COD_NOVO_ANTIGO[n]=o));
  REP = reps[repId] || null;
  DRAFT_KEY = 'presto_draft_v2_' + UF;
  try{ localStorage.setItem('presto_uf', UF); if(repId) localStorage.setItem('presto_rep', repId); }catch(e){}

  document.title = 'Orçamento PRESTO – ' + UF;
  const chip = document.getElementById('uf-chip');
  chip.textContent = UF + ' ✎';
  chip.href = '../' + (repId ? '?rep='+repId : '') + '#trocar';
  chip.title = PERFIL.nome + ' · Tabela ' + tab.tabela + ' (' + tab.gerado_em.split('-').reverse().join('/') + ') — toque para trocar a região';
  document.getElementById('btn-boleto').textContent = PERFIL.boleto_label + ' (−' + Math.round(pol.pagamento.boleto.desconto*100) + '%)';

  PRESTO_IMG = await toDataURL('../assets/presto.jpg');
  REP_IMG = REP ? await toDataURL('../' + REP.logo) : '';

  updateBadges(); renderTable(); loadDraftIfAny();
}
boot();
if('serviceWorker' in navigator){ navigator.serviceWorker.register('../sw.js').catch(()=>{}); }
