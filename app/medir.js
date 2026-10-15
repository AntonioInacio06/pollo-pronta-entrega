/* Pollo Decor — medição de acesso no PostHog (projeto 307250, região UE). Só leitura de uso: quem abriu, qual página,
   quando, celular ou computador. Uso: <script defer src="app/medir.js" data-app="rep|gerente|pcp|clientes|metas|painel|catalogo|gestao"></script>
   Proteções (o site é público e o código de acesso vai no endereço #t= / #g=):
   - só mede no endereço publicado (github.io); arquivo aberto no computador ou teste local não envia nada;
   - tira o #... e o ?... de todo endereço antes de enviar (o código de acesso nunca sai);
   - sem gravação de tela e sem o texto dos botões/linhas clicados (nomes de clientes, valores e preços não saem);
   - o representante é identificado só pelo nome e região, depois de entrar (window.polloMedirQuem). */
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
  };
})();
