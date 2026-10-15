/* Pollo Decor — medição de acesso no PostHog (projeto 307250, região UE). Só leitura de uso: quem abriu, qual página,
   quando, celular ou computador. Uso: <script defer src="app/medir.js" data-app="rep|gerente|pcp|clientes|metas|painel|catalogo|gestao"></script>
   Proteções (o site é público e o código de acesso vai no endereço #t= / #g=):
   - só mede no endereço publicado (github.io); arquivo aberto no computador ou teste local não envia nada;
   - tira o #... e o ?... de todo endereço antes de enviar (o código de acesso nunca sai);
   - sem gravação de tela e sem o texto dos botões/linhas clicados (nomes de clientes, valores e preços não saem);
   - o representante é identificado só pelo nome e região, depois de entrar (window.polloMedirQuem);
   - cidade pelo aparelho, com permissão: só cidade/UF vão para o PostHog (ver localizar() no fim). */
(function () {
  "use strict";
  if (!/\.github\.io$/.test(location.hostname)) { window.polloMedirQuem = window.polloMedirEvento = function () {}; return; }
  var app = (document.currentScript && document.currentScript.dataset.app) || "site";

  // carregador oficial do PostHog (snippet padrão, reduzido): cria a fila window.posthog até o script chegar
  !function (t, e) { var o, n, p, r; e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) { function g(t, e) { var o = e.split("."); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } } (p = t.createElement("script")).type = "text/javascript", p.crossOrigin = "anonymous", p.async = !0, p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js", (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r); var u = e; for (void 0 !== a ? u = e[a] = [] : a = "posthog", u.people = u.people || [], u.toString = function (t) { var e = "posthog"; return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e }, u.people.toString = function () { return u.toString(1) + ".people (stub)" }, o = "init capture register register_once unregister identify alias set_config reset opt_in_capturing opt_out_capturing has_opted_out_capturing people.set people.set_once".split(" "), n = 0; n < o.length; n++) g(u, o[n]); e._i.push([i, s, a]) }, e.__SV = 1) }(document, window.posthog || []);

  function semCodigo(v) { return typeof v === "string" && /^https?:\/\//.test(v) ? v.replace(/[?#].*$/, "") : v; }
  function limpar(obj) { if (!obj || typeof obj !== "object") return; for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) obj[k] = semCodigo(obj[k]); }

  posthog.init("phc_ssD96oyNaeYXFZmqgn5UZ65X8PVXDi7Q4JxirSSttaw5", {
    api_host: "https://eu.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    mask_all_text: true,                    // clique registrado sem o texto do elemento
    mask_all_element_attributes: true,
    disable_session_recording: true,
    disable_surveys: true,
    before_send: function (ev) {
      if (!ev) return ev;
      limpar(ev.properties); limpar(ev.$set); limpar(ev.$set_once);
      if (ev.properties) { limpar(ev.properties.$set); limpar(ev.properties.$set_once); }
      return ev;
    }
  });
  posthog.register({ app: app, instalado: navigator.standalone === true || matchMedia("(display-mode: standalone)").matches });

  // evento de negócio (ex.: reserva). Nunca mandar preço nem dado de cliente.
  window.polloMedirEvento = function (nome, props) { try { posthog.capture(nome, props || {}); } catch (e) {} };

  // a página do representante chama isto depois do login: polloMedirQuem(nome, regiao)
  window.polloMedirQuem = function (nome, regiao) {
    if (!nome) return;
    var id = "rep:" + String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
    try { posthog.identify(id, { name: nome, regiao: regiao || "", tipo: "representante" }); } catch (e) {}
    localizar();
  };

  /* CIDADE PELO APARELHO (15/10/2026): a cidade pelo IP erra no iPhone (Relay Privado do iCloud e rede da operadora
     punham Campinas em Cuiabá e Rio em Itabuna). Com a permissão do representante, o aparelho dá a posição, a página
     acha o município mais próximo na tabela do IBGE (app/municipios.json, no próprio site) e manda SÓ cidade e UF.
     A coordenada nunca sai do aparelho. Recusou -> "negado" e só pergunta de novo em 7 dias. */
  var localJaPedido = false;
  function lerLS(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function gravarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function aplicar(loc) {
    posthog.register({ cidade_gps: loc.cidade, uf_gps: loc.uf, local_fonte: "aparelho" });
    posthog.capture("localizacao", { cidade_gps: loc.cidade, uf_gps: loc.uf, precisao_km: loc.precisao_km, distancia_centro_km: loc.dist_km,
      $set: { ultima_cidade_gps: loc.cidade + "/" + loc.uf } });
  }
  function negado() { posthog.unregister("cidade_gps"); posthog.unregister("uf_gps"); posthog.register({ local_fonte: "negado" }); }
  function municipioMaisPerto(lat, lon, lista) {
    var r = Math.PI / 180, cl = Math.cos(lat * r), melhor = null, dm = 1e18;
    for (var i = 0; i < lista.length; i++) {
      var m = lista[i], dy = m[2] - lat, dx = (m[3] - lon) * cl, d = dx * dx + dy * dy;
      if (d < dm) { dm = d; melhor = m; }
    }
    return { cidade: melhor[0], uf: melhor[1], dist_km: Math.round(Math.sqrt(dm) * 111.2) };
  }
  function pegarPosicao() {
    navigator.geolocation.getCurrentPosition(function (pos) {
      fetch("app/municipios.json").then(function (r) { return r.json(); }).then(function (lista) {
        var loc = municipioMaisPerto(pos.coords.latitude, pos.coords.longitude, lista);
        loc.precisao_km = Math.round((pos.coords.accuracy || 0) / 1000); loc.em = Date.now();
        gravarLS("pollo-local", loc); aplicar(loc);
      }).catch(function () {});
    }, function (err) { if (err && err.code === 1) { gravarLS("pollo-local-recusa", Date.now()); negado(); } },
    { enableHighAccuracy: false, timeout: 20000, maximumAge: 15 * 60000 });
  }
  function barraPedido() {
    var rec = lerLS("pollo-local-recusa"); if (rec && Date.now() - rec < 7 * 864e5) return;
    var b = document.createElement("div"); b.setAttribute("role", "region"); b.setAttribute("aria-label", "Permitir localização");
    b.style.cssText = "position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 12px);z-index:9999;display:flex;align-items:center;gap:10px;" +
      "padding:10px 10px 10px 14px;border-radius:12px;background:#1C2220;color:#fff;font:14px/1.35 system-ui,-apple-system,sans-serif;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.28);max-width:520px;margin:0 auto";
    var t = document.createElement("div"); t.style.cssText = "flex:1;min-width:0";
    t.innerHTML = "<b>Permitir localização?</b><br>A fábrica vê só a <b>cidade</b> de onde você acessa. O ponto exato não sai do seu celular.";
    var bs = "border:0;border-radius:8px;font:600 14px system-ui,-apple-system,sans-serif;touch-action:manipulation;cursor:pointer;padding:10px 12px;";
    var ok = document.createElement("button"); ok.type = "button"; ok.textContent = "Permitir"; ok.style.cssText = bs + "background:#D38D5C;color:#1B120D";
    var nao = document.createElement("button"); nao.type = "button"; nao.textContent = "Agora não"; nao.style.cssText = bs + "background:transparent;color:#fff";
    ok.onclick = function () { b.remove(); pegarPosicao(); };
    nao.onclick = function () { b.remove(); gravarLS("pollo-local-recusa", Date.now()); posthog.register({ local_fonte: "recusou_aviso" }); };
    b.appendChild(t); b.appendChild(ok); b.appendChild(nao); document.body.appendChild(b);
  }
  function localizar() {
    if (localJaPedido || !navigator.geolocation) return; localJaPedido = true;
    var c = lerLS("pollo-local");
    if (c && c.cidade && Date.now() - c.em < 2 * 36e5) { aplicar(c); return; }       // posição de até 2 h atrás: reaproveita
    var perguntar = function () { setTimeout(barraPedido, 1500); };
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" }).then(function (st) {
        if (st.state === "granted") pegarPosicao(); else if (st.state === "denied") negado(); else perguntar();
      }).catch(perguntar);
    } else perguntar();
  }
})();
