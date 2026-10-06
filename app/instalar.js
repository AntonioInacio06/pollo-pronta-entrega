/* Pollo Decor — instalar a página na tela inicial do celular (ícone próprio, abre direto, tela cheia).
   Uso: <script defer src="app/instalar.js" data-app="rep|gerente|pcp" data-chave="pe-token" data-param="t" data-fundo="76"></script>
   Android/Chrome: manifesto + botão "Instalar". iPhone: sem manifesto de propósito — o atalho do iOS guarda o endereço da
   página, então o código da pessoa volta para o endereço (#t=...) antes de ela adicionar; o app instalado no iPhone não
   enxerga o que o Safari guardou. */
(function () {
  "use strict";
  var s = document.currentScript, app = s.dataset.app, chave = s.dataset.chave, param = s.dataset.param, fundo = +(s.dataset.fundo || 16);
  var ios = "standalone" in navigator;                       // só o Safari do iPhone/iPad tem esta propriedade
  var instalado = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  var ler = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var token = function () { return ler(chave); };

  if (!ios) { var l = document.createElement("link"); l.rel = "manifest"; l.href = "app/" + app + ".webmanifest"; document.head.appendChild(l); }
  function codigoNoEndereco() {
    var t = token(); if (!ios || !t || location.hash.indexOf(param + "=") >= 0) return;
    try { history.replaceState(null, "", location.pathname + "#" + param + "=" + encodeURIComponent(t)); } catch (e) {}
  }
  codigoNoEndereco(); setTimeout(codigoNoEndereco, 1500); setInterval(codigoNoEndereco, 4000);
  if (instalado) return;

  var pedido = null, barra = null;
  function fechar() { try { localStorage.setItem("pollo-instalar-fechado", String(Date.now())); } catch (e) {} if (barra) barra.remove(); barra = null; }
  function mostrar() {
    if (barra || !token() || !matchMedia("(pointer: coarse)").matches) return;
    var f = +ler("pollo-instalar-fechado") || 0; if (Date.now() - f < 14 * 864e5) return;      // fechou: só volta em 14 dias
    if (!ios && !pedido) return;
    barra = document.createElement("div");
    barra.setAttribute("role", "region"); barra.setAttribute("aria-label", "Instalar no celular");
    barra.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + " + fundo + "px);z-index:9999;" +
      "display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;border-radius:12px;background:#1C2220;color:#fff;" +
      "font:14px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.28);max-width:520px;margin:0 auto";
    var txt = document.createElement("div"); txt.style.cssText = "flex:1;min-width:0";
    var b = "border:0;border-radius:8px;font:600 14px system-ui,-apple-system,sans-serif;touch-action:manipulation;-webkit-user-select:none;user-select:none;cursor:pointer;";
    if (ios) {
      txt.innerHTML = "<b>Deixar na tela do celular</b><br>Toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.";
    } else {
      txt.innerHTML = "<b>Instalar no celular</b><br>Fica um ícone da Pollo e abre direto.";
      var ok = document.createElement("button"); ok.type = "button"; ok.textContent = "Instalar";
      ok.style.cssText = b + "padding:10px 14px;background:#D38D5C;color:#1B120D";
      ok.onclick = function () { var p = pedido; pedido = null; if (!p) return; p.prompt(); p.userChoice.then(function () { if (barra) barra.remove(); barra = null; }); };
    }
    var x = document.createElement("button"); x.type = "button"; x.setAttribute("aria-label", "Fechar"); x.textContent = "×";
    x.style.cssText = b + "width:40px;height:40px;background:transparent;color:#fff;font-size:22px;line-height:1";
    x.onclick = fechar;
    barra.appendChild(txt); if (ok) barra.appendChild(ok); barra.appendChild(x); document.body.appendChild(barra);
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); pedido = e; mostrar(); });
  window.addEventListener("appinstalled", function () { if (barra) barra.remove(); barra = null; });
  if (ios) { setTimeout(mostrar, 2500); setInterval(mostrar, 5000); }
})();
