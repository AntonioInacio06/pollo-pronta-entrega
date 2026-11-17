// gerente_pedidos.js — 17/11/2026 (PCP Bruno, pedido do Inácio)
// Só para a página dos GERENTES (gerente.html). Os representantes não carregam este arquivo.
// 1) Descontos do gerente: 4 em cascata para EM LINHA e 4 para FORA DE LINHA (cada gerente vê só os dele, com histórico).
// 2) Região: o gerente escolhe a região e o produto EM LINHA mostra o preço da tabela da região (enviada na aba Pedidos).
// 3) Relatório da pronta entrega (PDF pela impressão e Excel) do filtro ativo, com os descontos de quem gera.
// 4) Aba Pedidos: lançar pedido do gerente (item da pronta entrega baixa o estoque; o que passar do livre vira pedido novo),
//    ver os pedidos de todos os gerentes, cancelar (só quem lançou ou o PCP) e enviar a tabela de preço da região (.xlsx).

const GP_REGIOES = [["br_es_go_spcap", "Brasília, ES, GO e SP capital"], ["mt_intsp_ne_sul", "MT, interior SP, Nordeste e Sul"], ["mg_rj", "Minas Gerais e Rio de Janeiro"]];
const gpNomeRegiao = (r) => (GP_REGIOES.find((x) => x[0] === r) || [r, r || "sem região"])[1];
const gpLS = { ler(k, p) { try { const v = localStorage.getItem("gp-" + k); return v == null ? p : JSON.parse(v); } catch (e) { return p; } },
  gravar(k, v) { try { localStorage.setItem("gp-" + k, JSON.stringify(v)); } catch (e) {} } };
let gp = { desc: null, tabs: null, regiao: gpLS.ler("regiao", ""), esc: gpLS.ler("esc", {}), abertoDesc: false, cache: {},
  ped: null, form: null, imp: null, msgImp: "", cliRes: [], cliT: null, itRes: [], filtroPed: "todos" };
const brl2 = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
const fatorDesc = (l) => (l || []).reduce((a, d) => a * (1 - (Number(d) || 0) / 100), 1);
const descTxt = (l) => (l || []).filter((d) => Number(d) > 0).map((d) => pct(d)).join(" + ");

// ---------- casamento PE × tabela da região (mesmas regras testadas em 17/11/2026 nas 3 regiões) ----------
function gpNorm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/FELLIPO|FELIPPO|FILLIPO/g, "FILIPPO").replace(/MONALIZA/g, "MONALISA").replace(/MARTTINI/g, "MARTINI")
  .replace(/(\d)X(\d)/g, "$1 $2").replace(/[^A-Z0-9+]+/g, " ").trim(); }
const GP_VAZIAS = new Set(["DE", "DA", "DO", "COM", "E", "LACA", "LAMINA", "LAMINADO", "LAMINADA", "LC", "PLUS", "LUGAR", "EM", "PES", "LAMINADOS", "LAQUEADO", "VIDRO", "PAR", "UND", "UN"]);
const GP_GENERICAS = new Set(["CENTRO", "JANTAR", "CABECEIRA", "CENTRAL", "LATERAL", "MOLDURA", "ESPELHO", "PRATA", "SPECIAL", "COMPLETO"]);
function gpNums(s) { return (gpNorm(s).match(/\b\d{3,4}\b/g) || []).filter((n) => +n >= 300); }
function gpPalavras(s) { return gpNorm(s).split(" ").filter((w) => w.length > 2 && !/\d/.test(w) && !GP_VAZIAS.has(w)); }
function casarTabela(prod, codigo, itens) {
  const pn = gpNums(prod), pw = gpPalavras(prod), par = /^PAR\b/.test(gpNorm(prod));
  const tam = (t) => { const tn = gpNums(t.desc); if (!pn.length && !tn.length) return 1; if (pn.length && tn.length) return pn.some((n) => tn.includes(n)) ? 1 : -1; return 0; };
  const pts = (t) => { const tw = new Set(gpPalavras(t.desc)); return pw.filter((w) => tw.has(w)).length; };
  const saida = (t, via) => { const tp = /^PAR\b/.test(gpNorm(t.desc)); return { preco: par && !tp ? Math.round(t.preco * 200) / 100 : t.preco, unid: par ? (tp ? "o par" : "o par (2 × un. da tabela)") : "un.", via, desc: t.desc, cod: t.cod }; };
  const unicos = (l) => { const v = new Map(); for (const t of l) { const k = t.desc + "|" + t.preco; if (!v.has(k)) v.set(k, t); } return [...v.values()]; };
  let c = unicos(itens.filter((t) => t.cod === String(codigo) && tam(t) >= 0));
  if (c.length) { const seg = c.filter((t) => tam(t) === 1), base = seg.length ? seg : c, mx = Math.max(...base.map(pts)), top = base.filter((t) => pts(t) === mx);
    if (top.length === 1 && tam(top[0]) === 1) return saida(top[0], "código");
    if (new Set(top.map((t) => t.preco)).size === 1 && tam(top[0]) === 1) return saida(top[0], "código");
    return { opcoes: c.map((t) => saida(t, "código")) }; }
  // pelo nome nunca é automático: vira sugestão para o gerente confirmar
  const modelo = pw.slice(1).filter((w) => !GP_GENERICAS.has(w));
  if (!pw.length || !modelo.length) return null;
  c = unicos(itens.filter((t) => { if (/\+/.test(t.desc)) return false; const tw = new Set(gpPalavras(t.desc)); return tw.has(pw[0]) && tw.has(modelo[0]) && tam(t) >= 0; }));
  if (!c.length) return null;
  c.sort((a, b) => tam(b) - tam(a) || pts(b) - pts(a));
  return { opcoes: c.slice(0, 8).map((t) => saida(t, "nome")) };
}
function gpTabela(regiao) { const a = gp.tabs && gp.tabs.ativas; return a ? a.find((t) => t.regiao === regiao) || null : null; }
// preço de tabela de um item da PE na região escolhida: {preco, unid, via, desc} | {opcoes:[...]} | null
function gpPrecoTabela(i, regiao) {
  const t = gpTabela(regiao || gp.regiao); if (!t || !i.em_linha) return null;
  const k = t.id + "|" + i.id; if (!(k in gp.cache)) gp.cache[k] = casarTabela(i.produto, i.codigo, t.itens || []);
  const r = gp.cache[k]; if (!r || !r.opcoes) return r;
  const e = gp.esc[t.regiao + "|" + i.produto], o = e != null ? r.opcoes.find((x) => x.desc + "|" + x.preco === e) : null;
  return o ? Object.assign({ escolhida: true }, o) : r;
}
// preço de partida (antes do desconto) de um item da PE: {valor, unid, origem, opcoes?}
function gpPrecoBase(i) {
  if (!i.em_linha) return i.preco != null ? { valor: Number(i.preco), unid: /par/i.test(i.observacao || "") ? "o par" : "un.", origem: "fora" } : { valor: null, origem: "sem" };
  const r = gpPrecoTabela(i);
  if (!r) return { valor: null, origem: gpTabela(gp.regiao) ? "sem" : "semTabela" };
  if (r.opcoes) return { valor: null, origem: "opcoes", opcoes: r.opcoes };
  return { valor: Number(r.preco), unid: r.unid, origem: r.via === "nome" ? "nome" : "tabela", desc: r.desc };
}
function gpDescontos() { const a = (gp.desc && gp.desc.atual) || {}; return { linha: (a.linha || [0, 0, 0, 0]).map(Number), fora: (a.fora || [0, 0, 0, 0]).map(Number) }; }

async function gpCarregar(forcar) {
  try {
    if (!gp.desc || forcar) { const d = await chamar("api_descontos", { p_token: token }); if (d && !d.erro) gp.desc = d; }
    if (!gp.tabs || forcar) { const t = await chamar("api_tabelas_preco", { p_token: token }); if (t && !t.erro) { gp.tabs = t; gp.cache = {}; } }
  } catch (e) { toast("Não consegui carregar descontos e tabelas."); }
  if (!gp.regiao && gp.tabs && gp.tabs.ativas && gp.tabs.ativas.length === 1) gp.regiao = gp.tabs.ativas[0].regiao;
  if (montado && aba === "pe" && $("#peLista")) { gpRenderBarra(); renderPELista(); }
  if (montado && aba === "ped") renderPed();
}

// ---------- linha de preço do item na pronta entrega ----------
function gpPrecoEl(i) {
  const b = gpPrecoBase(i), d = gpDescontos(), lst = i.em_linha ? d.linha : d.fora, f = fatorDesc(lst);
  if (b.origem === "semTabela") return el("div", { class: "precoItem tab" }, gp.regiao ? "Envie a tabela da região na aba Pedidos" : "Escolha a região para ver o preço");
  if (b.origem === "opcoes") {
    const t = gpTabela(gp.regiao), s = el("select", { class: "gpVar", "aria-label": "Variante da tabela" }, el("option", { value: "" }, "Escolher a variante da tabela (" + b.opcoes.length + ")"),
      ...b.opcoes.map((o) => el("option", { value: o.desc + "|" + o.preco }, titulo(o.desc) + " — " + brl2(o.preco) + " " + o.unid + (o.via === "nome" ? " (pelo nome, conferir)" : ""))));
    s.addEventListener("change", () => { if (!s.value) return; gp.esc[t.regiao + "|" + i.produto] = s.value; gpLS.gravar("esc", gp.esc); renderPELista(); });
    return el("div", { class: "precoItem tab" }, s);
  }
  if (b.valor == null) return el("div", { class: "precoItem tab" }, i.em_linha ? "Consultar tabela" : "Preço sob consulta");
  const fin = Math.round(b.valor * f * 100) / 100, t = gpTabela(gp.regiao);
  const esc = i.em_linha && t && gp.esc[t.regiao + "|" + i.produto];
  return el("div", { class: "precoItem" }, f < 1 ? el("s", { class: "gpOrig" }, brl2(b.valor)) : null, f < 1 ? " → " : null, brl2(fin), el("small", null, b.unid || "un."),
    el("small", { class: "gpOrigem" }, (i.em_linha ? "tabela " + gpNomeRegiao(gp.regiao) + (b.origem === "nome" ? " · pelo nome, conferir" : "") : "fora de linha") + (f < 1 ? " · desc. " + descTxt(lst) : "")),
    esc ? el("button", { class: "gpLink", type: "button", onclick: () => { delete gp.esc[t.regiao + "|" + i.produto]; gpLS.gravar("esc", gp.esc); renderPELista(); } }, "trocar variante") : null);
}

// ---------- barra da pronta entrega: região, descontos, relatório ----------
function gpRenderBarra() {
  const box = $("#gpBarra"); if (!box) return;
  const sReg = el("select", { id: "gpRegiao", "aria-label": "Região da tabela" }, el("option", { value: "" }, "Região da tabela…"),
    ...GP_REGIOES.map(([v, n]) => { const t = gpTabela(v); return el("option", { value: v, selected: gp.regiao === v ? true : null }, n + (t ? " · v" + t.versao : " · sem tabela")); }));
  sReg.addEventListener("change", () => { gp.regiao = sReg.value; gpLS.gravar("regiao", gp.regiao); gpRenderBarra(); renderPELista(); });
  const d = gpDescontos(), tem = d.linha.some((x) => x > 0) || d.fora.some((x) => x > 0);
  const resumo = "Em linha: " + (descTxt(d.linha) || "sem desconto") + " · Fora de linha: " + (descTxt(d.fora) || "sem desconto");
  const kids = [el("div", { class: "ferramentas gpLinha" }, sReg,
    el("button", { class: "bt", type: "button", "aria-expanded": String(gp.abertoDesc), onclick: () => { gp.abertoDesc = !gp.abertoDesc; gpRenderBarra(); } }, gp.abertoDesc ? "Fechar descontos" : "Meus descontos"),
    el("button", { class: "bt", type: "button", onclick: () => gpRelatorio("pdf") }, "Relatório PDF"),
    el("button", { class: "bt", type: "button", onclick: () => gpRelatorio("xlsx") }, "Relatório Excel")),
    el("div", { class: "nota gpNota" }, (tem ? "Seus descontos (em cascata): " : "") + resumo + ". Só você vê os seus descontos.")];
  if (gp.abertoDesc) kids.push(gpBlocoDescontos());
  box.replaceChildren(...kids);
}
function gpCamposDesc(prefixo, vals) {
  return vals.map((v, k) => el("label", { class: "gpD" }, (k + 1) + "º", el("input", { type: "text", inputmode: "decimal", id: prefixo + k, value: v ? String(v).replace(".", ",") : "", placeholder: "0", "aria-label": (k + 1) + "º desconto" }), "%"));
}
function gpLerDesc(prefixo) { const r = []; for (let k = 0; k < 4; k++) { const n = $("#" + prefixo + k), v = n && n.value.trim() ? lerNumero(n.value) : 0; r.push(v); } return r; }
function gpBlocoDescontos() {
  const d = gpDescontos(), h = (gp.desc && gp.desc.historico) || [];
  const salvar = async () => {
    const l = gpLerDesc("gpL"), f = gpLerDesc("gpF");
    if ([...l, ...f].some((x) => !isFinite(x) || x < 0 || x >= 100)) { toast("Cada desconto tem de ser um número de 0 a 99,99."); return; }
    if (ocupado) return; ocupado = true;
    try { const r = await chamar("api_salvar_descontos", { p_token: token, p_linha: l, p_fora: f }); if (!r || r.erro) throw new Error(r && r.erro); gp.desc = r; toast("Descontos gravados."); }
    catch (e) { toast("Não consegui gravar os descontos."); }
    ocupado = false; gpRenderBarra(); renderPELista();
  };
  return el("div", { class: "gpDesc" },
    el("div", { class: "gpDGrupo" }, el("b", null, "Em linha"), ...gpCamposDesc("gpL", d.linha), el("span", { class: "gpFator" }, "total " + pct((1 - fatorDesc(d.linha)) * 100))),
    el("div", { class: "gpDGrupo" }, el("b", null, "Fora de linha"), ...gpCamposDesc("gpF", d.fora), el("span", { class: "gpFator" }, "total " + pct((1 - fatorDesc(d.fora)) * 100))),
    el("div", null, el("button", { class: "bt forte", type: "button", onclick: salvar }, "Gravar descontos")),
    el("div", { class: "nota" }, "Os descontos são aplicados um sobre o outro (10% e depois 5% = 14,5%). Valem para o preço mostrado, o relatório e como sugestão no pedido."),
    h.length ? el("div", { class: "gpHist" }, el("b", null, "Histórico"), ...h.slice(0, 20).map((x) => el("div", null, quandoBR(x.em) + " — em linha " + (descTxt(x.linha) || "0%") + " · fora " + (descTxt(x.fora) || "0%")))) : null);
}

// ---------- relatório (filtro ativo da pronta entrega) ----------
function gpItensFiltrados() {
  const itens = (pe.d && pe.d.itens) || [], temFoto = (i) => !!(pe.novas[i.produto] || pe.fotos[i.produto]);
  const termos = semAcento(pe.busca).trim().split(/\s+/).filter(Boolean);
  return itens.filter((i) => (pe.filtro !== "linha" || i.em_linha) && (pe.filtro !== "fora" || !i.em_linha) && (pe.filtro !== "sem" || !temFoto(i)) && (pe.filtro !== "novas" || pe.novas[i.produto]) && (!termos.length || termos.every((t) => semAcento(i.produto + " " + i.cor + " " + (i.categoria || "")).indexOf(t) >= 0)))
    .sort((a, b) => String(a.categoria || "").localeCompare(String(b.categoria || "")) || String(a.produto).localeCompare(String(b.produto)));
}
function gpLinhasRel() {
  const d = gpDescontos();
  return gpItensFiltrados().map((i) => { const b = gpPrecoBase(i), f = fatorDesc(i.em_linha ? d.linha : d.fora);
    return { produto: i.produto, cat: i.categoria || "", cod: i.codigo || "", prod: titulo(i.produto), cor: titulo(i.cor), tipo: i.em_linha ? "Em linha" : "Fora de linha", livres: i.disponivel, estoque: i.qtd,
      orig: b.valor, fin: b.valor == null ? null : Math.round(b.valor * f * 100) / 100, unid: b.valor == null ? "" : (b.unid || "un."),
      obs: b.valor != null ? "" : b.origem === "opcoes" ? "Escolher variante" : b.origem === "semTabela" ? "Sem tabela da região" : i.em_linha ? "Consultar tabela" : "Preço sob consulta" }; });
}
const GP_FILTRO_TXT = { todos: "Tudo", linha: "Em linha", fora: "Fora de linha", sem: "Sem foto", novas: "Foto enviada pela gerência" };
// foto do produto em JPEG pequeno (dataURL) para os relatórios; foto enviada pela gerência tem prioridade
const gpFotoRel = {};
async function gpFotoDataURL(produto) {
  if (produto in gpFotoRel) return gpFotoRel[produto];
  let src = null;
  if (pe.novas[produto]) {
    if (!fotoCache[produto]) { try { const r = await sb.rpc("api_foto", { p_token: token, p_produto: produto }); if (r.data && r.data.dados) fotoCache[produto] = r.data.dados; } catch (e) {} }
    src = fotoCache[produto] || null;
  }
  if (!src && pe.fotos[produto]) src = pe.fotos[produto];
  let out = null;
  if (src) out = await new Promise((ok) => { const im = new Image(); im.onload = () => { try { const L = 200, k = Math.min(1, L / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
      const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h); ok({ url: c.toDataURL("image/jpeg", 0.8), w, h }); } catch (e) { ok(null); } };
    im.onerror = () => ok(null); im.src = src; });
  gpFotoRel[produto] = out; return out;
}
async function gpFotosDe(lin) { const u = [...new Set(lin.map((l) => l.produto))], m = {}; let k = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (k < u.length) { const p = u[k++]; m[p] = await gpFotoDataURL(p); } })); return m; }
async function gpRelatorio(tipo) {
  if (!pe.d || !pe.d.itens) { toast("A pronta entrega ainda não carregou."); return; }
  const lin = gpLinhasRel(), d = gpDescontos(), hoje = new Date().toLocaleDateString("pt-BR");
  const cab = "Pronta entrega Pollo Decor — " + hoje + " · filtro: " + GP_FILTRO_TXT[pe.filtro] + (pe.busca ? " · busca \"" + pe.busca + "\"" : "") + " · região: " + (gp.regiao ? gpNomeRegiao(gp.regiao) : "não escolhida");
  const desc = "Descontos: em linha " + (descTxt(d.linha) || "0%") + " · fora de linha " + (descTxt(d.fora) || "0%");
  let w = null;
  if (tipo !== "xlsx") { w = window.open("", "_blank"); if (!w) { toast("O navegador bloqueou a janela do relatório. Libere pop-ups para este site."); return; }
    w.document.write("<p style='font:14px system-ui;margin:24px'>Montando o relatório com as fotos…</p>"); }
  toast("Montando o relatório com as fotos de " + lin.length + " itens…");
  const fotos = await gpFotosDe(lin);
  if (tipo === "xlsx") {
    try { if (!window.ExcelJS) await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"); } catch (e) { toast("Não consegui carregar o gerador de Excel."); return; }
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Pronta entrega");
    ws.columns = [10, 12, 10, 40, 22, 13, 10, 11, 14, 16, 12, 22].map((wch) => ({ width: wch }));
    ws.addRow([cab]).font = { bold: true, size: 13 }; ws.addRow([desc]); ws.addRow([]);
    const h = ws.addRow(["Foto", "Categoria", "Código", "Produto", "Cor", "Tipo", "Livres (pç)", "Estoque (pç)", "Preço original", "Preço com desconto", "Unidade", "Obs."]);
    h.font = { bold: true }; h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F2EE" } }; });
    ws.views = [{ state: "frozen", ySplit: 4 }];
    for (const l of lin) {
      const r = ws.addRow(["", l.cat, l.cod, l.prod, l.cor, l.tipo, l.livres, l.estoque, l.orig, l.fin, l.unid, l.obs]);
      r.height = 58; r.alignment = { vertical: "middle", wrapText: true };
      for (const c of [9, 10]) r.getCell(c).numFmt = "\"R$\" #,##0.00";
      const f = fotos[l.produto];
      if (f) { const id = wb.addImage({ base64: f.url, extension: "jpeg" }), k = 70 / Math.max(f.w, f.h);
        ws.addImage(id, { tl: { col: 0.08, row: r.number - 1 + 0.06 }, ext: { width: Math.round(f.w * k), height: Math.round(f.h * k) }, editAs: "oneCell" }); }
      else r.getCell(1).value = "sem foto";
    }
    const buf = await wb.xlsx.writeBuffer(), blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Pronta_entrega_" + new Date().toISOString().slice(0, 10) + ".xlsx";
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return;
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  const tot = lin.reduce((a, l) => a + l.livres, 0);
  const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>Pronta entrega " + esc(hoje) + "</title><style>body{font:12px system-ui,sans-serif;color:#1C2220;margin:18px}h1{font-size:16px;margin:0 0 4px}p{margin:2px 0;color:#525C57}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border-bottom:1px solid #D8DBD4;padding:5px 6px;text-align:left;vertical-align:middle}th{background:#F1F2EE;font-size:11px}td.n{text-align:right;white-space:nowrap}td.f{width:64px}td.f img{width:60px;height:60px;object-fit:contain;display:block}td.f span{color:#7F8883;font-size:10px}tr{break-inside:avoid}s{color:#7F8883}@media print{button{display:none}}</style></head><body>"
    + "<button onclick='print()'>Imprimir / salvar PDF</button><h1>" + esc(cab) + "</h1><p>" + esc(desc) + " · " + lin.length + " itens · " + tot + " peças livres</p>"
    + "<table><thead><tr><th>Foto</th><th>Categoria</th><th>Código</th><th>Produto</th><th>Cor</th><th>Tipo</th><th>Livres</th><th>Preço</th><th>Obs.</th></tr></thead><tbody>"
    + lin.map((l) => { const f = fotos[l.produto]; return "<tr><td class='f'>" + (f ? "<img alt='' src='" + f.url + "'>" : "<span>sem foto</span>") + "</td><td>" + esc(l.cat) + "</td><td>" + esc(l.cod) + "</td><td>" + esc(l.prod) + "</td><td>" + esc(l.cor) + "</td><td>" + esc(l.tipo) + "</td><td class='n'>" + l.livres + "</td><td class='n'>"
      + (l.orig == null ? "" : (l.fin < l.orig ? "<s>" + esc(brl2(l.orig)) + "</s> → " : "") + esc(brl2(l.fin)) + " " + esc(l.unid)) + "</td><td>" + esc(l.obs) + "</td></tr>"; }).join("")
    + "</tbody></table></body></html>";
  w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 500);
}

// ---------- tabela de preço da região (.xlsx lido no navegador) ----------
function gpRegiaoDoArquivo(nome) { const n = gpNorm(nome); return /BRASILIA/.test(n) ? "br_es_go_spcap" : /MATO GROSSO/.test(n) ? "mt_intsp_ne_sul" : /MINAS/.test(n) ? "mg_rj" : ""; }
async function gpLerTabela(arquivo) {
  if (!window.XLSX) await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" }), itens = [];
  for (const nomeAba of wb.SheetNames) {
    if (/markup|sayerlack|tecidos|particularidades/i.test(nomeAba)) continue;
    // a planilha declara ~1 milhão de linhas e 1.024 colunas (formatação); lê só até a última linha com dado, colunas A–E
    const ws = wb.Sheets[nomeAba]; let ultima = -1;
    for (const k in ws) { if (k[0] === "!") continue; const c = XLSX.utils.decode_cell(k);
      if (c.c <= 4 && c.r > ultima && ws[k].v != null && ws[k].v !== "") ultima = c.r; }
    if (ultima < 0) continue;
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: { s: { r: 0, c: 0 }, e: { r: ultima, c: 4 } } }); let vazias = 0;
    for (const r of linhas) {
      const cod = r[1], desc = r[2], preco = typeof r[4] === "number" ? r[4] : lerNumero(r[4]);
      const c = typeof cod === "number" ? cod : /^\d+$/.test(String(cod || "").trim()) ? Number(String(cod).trim()) : NaN;
      if (Number.isInteger(c) && c >= 1000 && c <= 99999 && desc && isFinite(preco) && preco > 0) { vazias = 0;
        itens.push({ cod: String(c), desc: String(desc).replace(/\s+/g, " ").trim(), preco: Math.round(preco * 100) / 100 }); }
      else if (++vazias > 500) break;
    }
  }
  const m = /VERS[AÃ]O\s*([\d.]+?)\.xlsx?$/i.exec(arquivo.name);
  return { regiao: gpRegiaoDoArquivo(arquivo.name), versao: m ? m[1] : "", arquivo: arquivo.name, itens };
}
async function gpGuardarTabela() {
  const t = gp.imp; if (!t || ocupado) return;
  if (!t.regiao) { toast("Escolha a região desta tabela."); return; }
  ocupado = true;
  try { const r = await chamar("api_guardar_tabela_preco", { p_token: token, p_dados: { regiao: t.regiao, nome: gpNomeRegiao(t.regiao), versao: t.versao || null, data: new Date().toISOString().slice(0, 10), arquivo: t.arquivo, itens: t.itens } });
    if (!r || r.erro) throw new Error(r && r.erro); toast("Tabela de " + gpNomeRegiao(t.regiao) + " guardada: " + fmt(t.itens.length) + " itens."); gp.imp = null; gp.msgImp = ""; }
  catch (e) { toast("Não consegui guardar a tabela" + (e && e.message ? " (" + e.message + ")" : "") + "."); }
  ocupado = false; await gpCarregar(true);
}

// ---------- aba Pedidos ----------
async function carregarPed() {
  try { const r = await chamar("api_pedidos_gerente", { p_token: token, p_dias: 120 }); if (r && !r.erro) gp.ped = r.pedidos || []; } catch (e) { toast("Não consegui carregar os pedidos."); }
  if (!gp.desc || !gp.tabs) await gpCarregar(); if (!pe.d) await carregarPE();
  if (montado && aba === "ped") renderPed();
}
function gpNovoForm() { const d = gpDescontos(); return { cliente: null, nomeLivre: "", regiao: gp.regiao, prazo: "", obs: "", linha: d.linha.slice(), fora: d.fora.slice(), itens: [], busca: "", buscaCli: "" }; }
function gpTotais(f) {
  const fl = fatorDesc(f.linha), ff = fatorDesc(f.fora); let bruto = 0, liq = 0;
  for (const it of f.itens) { const vu = Number(it.valor_unit) || 0, q = Number(it.qtd) || 0; bruto += vu * q; liq += Math.round(vu * (it.em_linha ? fl : ff) * 100) / 100 * q; }
  return { bruto, liq };
}
function gpBuscarItens(termo, regiao) {
  const ts = semAcento(termo).trim().split(/\s+/).filter(Boolean); if (!ts.length) return [];
  const bate = (s) => ts.every((t) => semAcento(s).indexOf(t) >= 0), r = [];
  for (const i of (pe.d && pe.d.itens) || []) if (bate(i.produto + " " + i.cor + " " + (i.codigo || ""))) r.push({ origem: "pe", i });
  const t = gpTabela(regiao); if (t) for (const x of t.itens || []) if (bate(x.desc + " " + x.cod)) r.push({ origem: "novo", x });
  return r.slice(0, 30);
}
function gpAddItem(res) {
  const f = gp.form;
  if (res.origem === "pe") { const i = res.i, ja = f.itens.find((x) => x.origem === "pe" && x.item_id === i.id); if (ja) { ja.qtd++; renderPed(); return; }
    const regAnt = gp.regiao; gp.regiao = f.regiao; const b = gpPrecoBase(i); gp.regiao = regAnt;
    f.itens.push({ origem: "pe", item_id: i.id, codigo: i.codigo || "", descricao: i.produto, cor: i.cor, em_linha: !!i.em_linha, qtd: 1, livres: i.disponivel,
      valor_unit: b.valor == null ? "" : b.valor, aviso: b.valor == null ? (b.origem === "opcoes" ? "escolha a variante na pronta entrega ou digite o preço" : "digite o preço") : b.origem === "nome" ? "preço pelo nome, conferir" : "" }); }
  else { const x = res.x; f.itens.push({ origem: "novo", item_id: null, codigo: x.cod, descricao: x.desc, cor: "", em_linha: true, qtd: 1, valor_unit: x.preco, aviso: "" }); }
  f.busca = ""; gp.itRes = []; renderPed();
}
async function gpBuscarCli(termo) {
  clearTimeout(gp.cliT); if (!termo || termo.trim().length < 3) { gp.cliRes = []; gpRenderCliRes(); return; }
  gp.cliT = setTimeout(async () => {
    try { const r = await chamar("api_clientes", { p_token: token, p_busca: termo.trim(), p_consultor: null, p_limite: 8, p_pulo: 0, p_situacao: null }); gp.cliRes = (r && r.clientes) || []; }
    catch (e) { gp.cliRes = []; }
    gpRenderCliRes();
  }, 350);
}
function gpRenderCliRes() {
  const box = $("#gpCliRes"); if (!box) return;
  box.replaceChildren(...gp.cliRes.map((c) => el("button", { class: "gpRes", type: "button", onclick: () => { gp.form.cliente = { cod: c.cod, nome: c.razao || c.fantasia || "", cidade: [c.cidade, c.uf].filter(Boolean).join("/") }; gp.cliRes = []; renderPed(); } },
    el("b", null, titulo(c.razao || c.fantasia)), " · cód. " + c.cod + (c.cidade ? " · " + titulo(c.cidade) + (c.uf ? "/" + c.uf : "") : ""))));
}
async function gpLancar() {
  const f = gp.form; if (!f || ocupado) return;
  const nome = f.cliente ? f.cliente.nome : f.nomeLivre.trim();
  if (!nome) { toast("Escolha o cliente (ou digite o nome)."); return; }
  if (!f.itens.length) { toast("Inclua pelo menos um item."); return; }
  if (f.itens.some((x) => !(Number(x.qtd) >= 1))) { toast("Toda quantidade tem de ser 1 ou mais."); return; }
  if (f.itens.some((x) => !(Number(x.valor_unit) > 0))) { toast("Falta o preço de algum item."); return; }
  if ([...f.linha, ...f.fora].some((x) => !isFinite(x) || x < 0 || x >= 100)) { toast("Cada desconto tem de ser um número de 0 a 99,99."); return; }
  const t = gpTotais(f);
  if (!confirm("Lançar o pedido de " + nome + " com " + f.itens.length + " itens, total " + brl2(t.liq) + "?")) return;
  ocupado = true;
  try {
    const r = await chamar("api_lancar_pedido_gerente", { p_token: token, p_dados: { cliente_nome: nome, cliente_cod: f.cliente ? String(f.cliente.cod) : "", cliente_cidade: f.cliente ? f.cliente.cidade : "",
      regiao: f.regiao || "", prazo: f.prazo.trim(), observacao: f.obs.trim(), d_linha: f.linha, d_fora: f.fora,
      itens: f.itens.map((x) => ({ origem: x.origem, item_id: x.item_id, codigo: x.codigo, descricao: x.descricao, cor: x.cor, qtd: Number(x.qtd), valor_unit: Number(x.valor_unit), em_linha: x.em_linha })) } });
    if (!r || r.erro) throw new Error(r && r.erro);
    gp.ped = r.pedidos || gp.ped; gp.form = null;
    toast("Pedido nº " + r.id + " lançado." + (r.viraram_novo ? " " + r.viraram_novo + " pç passaram do estoque livre e viraram pedido novo." : ""));
    pe.d = null; carregarPE();
  } catch (e) { toast("Não consegui lançar o pedido" + (e && e.message ? " (" + e.message + ")" : "") + "."); }
  ocupado = false; renderPed();
}
async function gpCancelar(p) {
  if (ocupado || !confirm("Cancelar o pedido nº " + p.id + " de " + p.cliente + "? As peças da pronta entrega voltam ao estoque livre.")) return;
  ocupado = true;
  try { const r = await chamar("api_cancelar_pedido_gerente", { p_token: token, p_id: p.id }); if (!r || r.erro) throw new Error(r && r.erro); toast("Pedido nº " + p.id + " cancelado."); pe.d = null; carregarPE(); }
  catch (e) { toast(e && e.message === "so_quem_lancou" ? "Só quem lançou o pedido ou o PCP pode cancelar." : "Não consegui cancelar o pedido."); }
  ocupado = false; await carregarPed();
}
function gpFormEl() {
  const f = gp.form, kids = [el("div", { class: "secao" }, "Novo pedido", el("span", null, "item da pronta entrega baixa o estoque; o que passar do livre vira pedido novo"))];
  // cliente
  if (f.cliente) kids.push(el("div", { class: "cad" }, el("div", { style: "flex:1" }, el("b", null, titulo(f.cliente.nome)), " · cód. " + f.cliente.cod + (f.cliente.cidade ? " · " + titulo(f.cliente.cidade) : "")),
    el("button", { class: "bt", type: "button", onclick: () => { f.cliente = null; renderPed(); } }, "Trocar cliente")));
  else { const b = el("input", { type: "search", id: "gpCli", placeholder: "Buscar cliente: nome, código ou CNPJ (3 letras ou mais)", autocomplete: "off", value: f.buscaCli });
    b.addEventListener("input", () => { f.buscaCli = b.value; gpBuscarCli(b.value); });
    const nl = el("input", { type: "text", id: "gpCliLivre", placeholder: "…ou digite o nome do cliente que não está na base", value: f.nomeLivre }); nl.addEventListener("input", () => { f.nomeLivre = nl.value; });
    kids.push(el("div", { class: "cad" }, b, nl), el("div", { id: "gpCliRes", class: "gpResLista" })); }
  // região, prazo, obs
  const sR = el("select", { id: "gpPedReg", "aria-label": "Região / tabela" }, el("option", { value: "" }, "Região / tabela…"), ...GP_REGIOES.map(([v, n]) => { const t = gpTabela(v); return el("option", { value: v, selected: f.regiao === v ? true : null }, n + (t ? " · v" + t.versao : " · sem tabela")); }));
  sR.addEventListener("change", () => { f.regiao = sR.value; renderPed(); });
  const pz = el("input", { type: "text", id: "gpPrazo", placeholder: "Prazo de pagamento (ex.: 30/60/90)", value: f.prazo }); pz.addEventListener("input", () => { f.prazo = pz.value; });
  const ob = el("input", { type: "text", id: "gpObs", placeholder: "Observação do pedido", value: f.obs }); ob.addEventListener("input", () => { f.obs = ob.value; });
  kids.push(el("div", { class: "cad" }, sR, pz, ob));
  // descontos do pedido
  const camp = (lst, pre) => lst.map((v, k) => { const n = el("input", { type: "text", inputmode: "decimal", id: pre + k, value: v ? String(v).replace(".", ",") : "", placeholder: "0", "aria-label": (k + 1) + "º desconto" });
    n.addEventListener("change", () => { const x = n.value.trim() ? lerNumero(n.value) : 0; lst[k] = isFinite(x) ? x : NaN; renderPed(); }); return el("label", { class: "gpD" }, (k + 1) + "º", n, "%"); });
  kids.push(el("div", { class: "gpDesc" }, el("div", { class: "gpDGrupo" }, el("b", null, "Desc. em linha"), ...camp(f.linha, "gpPL"), el("span", { class: "gpFator" }, "total " + pct((1 - fatorDesc(f.linha)) * 100))),
    el("div", { class: "gpDGrupo" }, el("b", null, "Desc. fora de linha"), ...camp(f.fora, "gpPF"), el("span", { class: "gpFator" }, "total " + pct((1 - fatorDesc(f.fora)) * 100)))));
  // busca de item
  const bi = el("input", { type: "search", id: "gpItBusca", placeholder: f.regiao && gpTabela(f.regiao) ? "Buscar item: descrição ou código (pronta entrega e tabela da região)" : "Buscar item da pronta entrega (escolha a região para buscar na tabela)", autocomplete: "off", value: f.busca });
  bi.addEventListener("input", () => { f.busca = bi.value; gp.itRes = gpBuscarItens(bi.value, f.regiao); gpRenderItRes(); });
  kids.push(el("div", { class: "ferramentas", style: "padding-top:0" }, bi), el("div", { id: "gpItRes", class: "gpResLista" }));
  // itens
  const fl = fatorDesc(f.linha), ff = fatorDesc(f.fora);
  for (const [k, it] of f.itens.entries()) {
    const q = el("input", { type: "number", min: "1", step: "1", value: it.qtd, "aria-label": "Quantidade", class: "gpQ" }); q.addEventListener("change", () => { it.qtd = Math.max(1, parseInt(q.value, 10) || 1); renderPed(); });
    const v = el("input", { type: "text", inputmode: "decimal", value: it.valor_unit === "" ? "" : String(it.valor_unit).replace(".", ","), placeholder: "preço un.", "aria-label": "Preço unitário", class: "gpV" });
    v.addEventListener("change", () => { const x = lerNumero(v.value); it.valor_unit = isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : ""; it.aviso = ""; renderPed(); });
    const cor = it.origem === "novo" ? (() => { const c = el("input", { type: "text", value: it.cor, placeholder: "cor", "aria-label": "Cor", class: "gpC" }); c.addEventListener("input", () => { it.cor = c.value; }); return c; })() : null;
    const fat = it.em_linha ? fl : ff, fin = it.valor_unit === "" ? null : Math.round(Number(it.valor_unit) * fat * 100) / 100;
    const passa = it.origem === "pe" ? Math.max(0, Number(it.qtd) - Math.max(0, Number(it.livres) || 0)) : 0;
    kids.push(el("div", { class: "peItem gpIt" },
      el("div", null, el("div", { class: "resNome" }, titulo(it.descricao)),
        el("div", { class: "resSub" }, it.origem === "pe" ? titulo(it.cor) : null, it.codigo ? el("span", null, "cód. " + it.codigo) : null,
          el("span", { class: "etq " + (it.em_linha ? "linha" : "fora") }, it.em_linha ? "Em linha" : "Fora de linha"),
          el("span", { class: "etq " + (it.origem === "pe" ? "neutra" : "lum") }, it.origem === "pe" ? "Pronta entrega · " + fmt(it.livres) + " livres" : "Pedido novo (tabela)"),
          passa ? el("span", { class: "etq crit" }, passa + " pç viram pedido novo") : null, it.aviso ? el("span", { class: "etq crit" }, it.aviso) : null),
        el("div", { class: "precoItem" }, fin == null ? "—" : (fat < 1 ? el("s", { class: "gpOrig" }, brl2(it.valor_unit)) : null), fin == null ? null : (fat < 1 ? " → " : ""), fin == null ? null : brl2(fin), el("small", null, "un. · total " + (fin == null ? "—" : brl2(fin * it.qtd))))),
      el("div", { class: "gpCampos" }, el("label", null, "qtd ", q), el("label", null, "R$ ", v), cor,
        el("button", { class: "bt", type: "button", onclick: () => { f.itens.splice(k, 1); renderPed(); } }, "Tirar"))));
  }
  const t = gpTotais(f);
  kids.push(el("div", { class: "cad gpTot" }, el("div", { style: "flex:1" }, el("b", null, f.itens.length + (f.itens.length === 1 ? " item" : " itens")), " · bruto " + brl2(t.bruto) + " · ", el("b", null, "líquido " + brl2(t.liq))),
    el("button", { class: "bt", type: "button", onclick: () => { if (!f.itens.length || confirm("Descartar este pedido?")) { gp.form = null; renderPed(); } } }, "Descartar"),
    el("button", { class: "bt forte", type: "button", onclick: gpLancar }, "Lançar pedido")));
  return kids;
}
function gpRenderItRes() {
  const box = $("#gpItRes"); if (!box) return;
  box.replaceChildren(...gp.itRes.map((r) => r.origem === "pe"
    ? el("button", { class: "gpRes", type: "button", onclick: () => gpAddItem(r) }, el("b", null, titulo(r.i.produto)), " · " + titulo(r.i.cor) + " · pronta entrega, " + fmt(r.i.disponivel) + " livres" + (r.i.em_linha ? "" : " · fora de linha"))
    : el("button", { class: "gpRes", type: "button", onclick: () => gpAddItem(r) }, el("b", null, titulo(r.x.desc)), " · cód. " + r.x.cod + " · tabela " + brl2(r.x.preco))));
}
function gpBlocoTabela() {
  const arq = el("input", { type: "file", id: "gpTabArq", accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", hidden: true });
  arq.addEventListener("change", async () => { const f = arq.files && arq.files[0]; arq.value = ""; if (!f) return; gp.msgImp = "Lendo " + f.name + "…"; renderPed();
    try { gp.imp = await gpLerTabela(f); gp.msgImp = gp.imp.itens.length ? "" : "Não achei itens nesta planilha (código na coluna B, descrição na C, preço na E)."; if (!gp.imp.itens.length) gp.imp = null; }
    catch (e) { gp.imp = null; gp.msgImp = "Não consegui ler esta planilha."; }
    renderPed(); });
  const ativas = (gp.tabs && gp.tabs.ativas) || [], kids = [el("div", { class: "secao" }, "Tabela de preço por região", el("span", null, "envie a planilha .xlsx da tabela; a nova substitui a anterior da mesma região")),
    el("div", { class: "cad" }, el("div", { style: "flex:1" }, ativas.length ? ativas.map((t) => gpNomeRegiao(t.regiao) + " v" + (t.versao || "?") + " (" + fmt(t.qtd_itens) + " itens, " + quandoBR(t.enviada_em) + (t.enviada_por ? " por " + t.enviada_por : "") + ")").join(" · ") : "Nenhuma tabela enviada ainda."),
      arq, el("button", { class: "bt forte", type: "button", onclick: () => arq.click() }, "Enviar tabela (.xlsx)"))];
  if (gp.msgImp) kids.push(el("div", { class: "nota" }, gp.msgImp));
  if (gp.imp) { const s = el("select", { "aria-label": "Região da tabela" }, el("option", { value: "" }, "Qual região?"), ...GP_REGIOES.map(([v, n]) => el("option", { value: v, selected: gp.imp.regiao === v ? true : null }, n)));
    s.addEventListener("change", () => { gp.imp.regiao = s.value; });
    kids.push(el("div", { class: "cad" }, el("div", { style: "flex:1" }, el("b", null, fmt(gp.imp.itens.length) + " itens lidos"), " de " + gp.imp.arquivo + (gp.imp.versao ? " · versão " + gp.imp.versao : "")), s,
      el("button", { class: "bt", type: "button", onclick: () => { gp.imp = null; renderPed(); } }, "Desistir"), el("button", { class: "bt forte", type: "button", onclick: gpGuardarTabela }, "Guardar tabela"))); }
  return kids;
}
function gpPedidoEl(p) {
  const cancel = !!p.cancelado_em;
  return el("div", { class: "peItem gpPed" + (cancel ? " gpCancel" : "") },
    el("div", null, el("div", { class: "resNome" }, "Nº " + p.id + " · " + titulo(p.cliente)),
      el("div", { class: "resSub" }, quandoBR(p.em), el("span", null, "gerente " + titulo(p.gerente)), p.regiao ? el("span", null, gpNomeRegiao(p.regiao) + (p.tabela ? "" : "")) : null, p.prazo ? el("span", null, "prazo " + p.prazo) : null,
        cancel ? el("span", { class: "etq crit" }, "Cancelado " + quandoBR(p.cancelado_em) + (p.cancelado_por ? " por " + p.cancelado_por : "")) : null),
      el("div", { class: "resSub" }, "Desc. em linha " + (descTxt(p.d_linha) || "0%") + " · fora " + (descTxt(p.d_fora) || "0%") + (p.observacao ? " · " + p.observacao : "")),
      ...(p.itens || []).map((i) => el("div", { class: "resSub" }, fmt(i.qtd) + " × " + titulo(i.descricao) + (i.cor ? " " + titulo(i.cor) : ""), el("span", { class: "etq " + (i.origem === "pe" ? "neutra" : "lum") }, i.origem === "pe" ? "pronta entrega" : "pedido novo"),
        el("span", null, brl2(i.valor_final) + " un.")))),
    el("div", { class: "peNums" }, el("div", null, el("b", null, brl(p.bruto)), el("small", null, "bruto")), el("div", { class: "livre" }, el("b", null, brl(p.liquido)), el("small", null, "líquido"))),
    el("div", { class: "peAcoes" }, cancel ? null : el("button", { class: "bt", type: "button", onclick: () => gpCancelar(p) }, p.meu ? "Cancelar" : "Cancelar (só PCP)")));
}
function renderPed() {
  const corpo = $("#corpo"); if (!corpo || aba !== "ped") return;
  const ativo = document.activeElement, idFoco = ativo && ativo.id, pos = ativo && typeof ativo.selectionStart === "number" ? ativo.selectionStart : null;
  const kids = [];
  if (!gp.form) kids.push(el("div", { class: "ferramentas" }, el("button", { class: "bt forte", type: "button", onclick: () => { gp.form = gpNovoForm(); renderPed(); } }, "Novo pedido")));
  else kids.push(...gpFormEl());
  kids.push(...gpBlocoTabela());
  const lst = (gp.ped || []).filter((p) => gp.filtroPed === "todos" || (gp.filtroPed === "meus" && p.meu) || (gp.filtroPed === "ativos" && !p.cancelado_em));
  kids.push(el("div", { class: "secao" }, "Pedidos dos gerentes", el("span", null, gp.ped ? fmt(gp.ped.length) + " nos últimos 120 dias · todos os gerentes veem" : "carregando…")),
    el("div", { class: "chips" }, ...[["todos", "Todos"], ["ativos", "Não cancelados"], ["meus", "Só os meus"]].map(([v, t]) => el("button", { class: "chip", type: "button", "aria-pressed": String(gp.filtroPed === v), onclick: () => { gp.filtroPed = v; renderPed(); } }, t))));
  if (gp.ped && !lst.length) kids.push(el("div", { class: "vazio" }, "Nenhum pedido nesta seleção."));
  for (const p of lst) kids.push(gpPedidoEl(p));
  corpo.replaceChildren(...kids);
  gpRenderCliRes(); gpRenderItRes();
  if (idFoco) { const n = document.getElementById(idFoco); if (n) { n.focus(); if (pos != null) try { n.setSelectionRange(pos, pos); } catch (e) {} } }
}

// estilos só desta parte
document.head.append(el("style", null, `
.gpLinha{padding-bottom:4px}.gpNota{padding:0 14px 8px;margin:0}
.gpDesc{display:grid;gap:8px;padding:12px 14px;background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:10px}
.gpDGrupo{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.gpDGrupo b{min-width:130px;font-size:13px}
.gpD{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:var(--ink-3)}
.gpD input{width:64px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--muted);text-align:right}
.gpFator{font:12px var(--f-mono);color:var(--ink-2)}
.gpHist{font-size:12px;color:var(--ink-3);display:grid;gap:2px;max-height:160px;overflow:auto}
.gpOrig{color:var(--ink-3);font-weight:400}.gpOrigem{display:block;color:var(--ink-3);font-size:11px}
.gpLink{border:0;background:none;color:var(--accent);font-size:11.5px;padding:0;text-decoration:underline}
.gpVar{max-width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--muted);font-size:12.5px}
.cad select{padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--muted);max-width:100%}
.gpResLista{display:grid;gap:4px;padding:0 14px}.gpRes{text-align:left;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);font-size:13px;color:var(--ink-2)}
.gpCampos{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.gpCampos label{font-size:12px;color:var(--ink-3)}
.gpQ{width:64px}.gpV{width:110px}.gpC{width:140px}.gpCampos input{padding:7px 8px;border:1px solid var(--line);border-radius:8px;background:var(--muted)}
.gpTot{align-items:center}.gpCancel{opacity:.6}
`));
