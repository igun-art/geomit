/* geomit: tema düğmesi, kaydırınca belirme, canlı sohbet örneği ve 3D sahnenin yüklenmesi.
   Hepsi süs: bu dosya hiç çalışmasa da sayfadaki tüm metin HTML'de eksiksiz görünür. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Tema ---------- */
  function resolvedTheme() {
    var t = root.getAttribute("data-theme");
    return t === "light" ? "light" : "dark"; // lacivert tema varsayılan
  }
  function syncTheme() {
    var t = resolvedTheme();
    root.setAttribute("data-theme-resolved", t);
    var btn = document.querySelector(".theme-toggle");
    if (btn) btn.setAttribute("aria-label", t === "dark" ? "Açık temaya geç" : "Koyu temaya geç");
    window.dispatchEvent(new CustomEvent("gm-theme", { detail: t }));
  }
  function setupTheme() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var next = resolvedTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("gm-theme", next); } catch (e) {}
      syncTheme();
    });
    syncTheme();
  }

  /* ---------- Kaydırınca belirme ---------- */
  function setupReveal() {
    if (reduce.matches || !("IntersectionObserver" in window)) return;
    var items = document.querySelectorAll("[data-reveal]");
    // Aynı kapsayıcıdaki kardeşler sırayla gelsin
    items.forEach(function (el) {
      var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.hasAttribute("data-reveal"); });
      el.style.setProperty("--d", Math.min(sibs.indexOf(el), 5));
    });
    root.classList.add("motion");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Sağ kenardaki bölüm noktaları: o an ekrandaki bölümü işaretle ---------- */
  function setupDots() {
    var links = document.querySelectorAll(".dots a");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute("aria-current"); });
        var a = byId[e.target.id];
        if (a) a.setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  /* ---------- Canlı sohbet örneği ---------- */
  function setupChat() {
    var chat = document.querySelector(".chat");
    if (!chat || reduce.matches || !("IntersectionObserver" in window)) return;

    var qP = chat.querySelector(".chat-q p");
    var aWho = chat.querySelector(".chat-a .chat-who");
    var aP = chat.querySelector(".chat-a p");
    var sources = chat.querySelectorAll(".sources li");
    var typing = chat.querySelector(".chat-typing");
    var replay = chat.querySelector(".chat-replay");

    // Soruyu harflere böl (metin DOM'da kalır, sadece görünürlük değişir)
    var qText = qP.textContent;
    qP.textContent = "";
    var chars = [];
    Array.from(qText).forEach(function (c) {
      var s = document.createElement("span");
      s.className = "ch";
      s.textContent = c;
      qP.appendChild(s);
      chars.push(s);
    });

    // Cevabı kelimelere böl; <mark> ve kaynak işaretleri tek parça kalır
    var words = [];
    Array.from(aP.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        var frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var w = document.createElement("span");
          w.className = "w";
          w.textContent = part;
          frag.appendChild(w);
          words.push(w);
        });
        aP.replaceChild(frag, node);
      } else if (node.nodeType === 1) {
        node.classList.add("w");
        words.push(node);
      }
    });

    var caret = document.createElement("span");
    caret.className = "caret";
    caret.setAttribute("aria-hidden", "true");

    var timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function reset() {
      timers.forEach(clearTimeout);
      timers = [];
      chat.querySelectorAll(".on").forEach(function (el) { el.classList.remove("on", "settled"); });
      if (caret.parentNode) caret.parentNode.removeChild(caret);
      replay.hidden = true;
    }

    function play() {
      reset();
      chat.classList.add("chat-prep");
      var t = 300;
      var pace = Math.min(1, 70 / chars.length); // uzun soru da ~3 saniyede yazılsın
      chars.forEach(function (c) {
        later(function () { c.classList.add("on"); c.after(caret); }, t);
        t += (26 + Math.random() * 30) * pace;
      });
      t += 350;
      later(function () { caret.remove(); typing.classList.add("on"); }, t);
      t += 1100;
      later(function () { typing.classList.remove("on"); aWho.classList.add("on"); }, t);
      t += 200;
      words.forEach(function (w) {
        // .keep: kaynak işareti ve noktası satır sonunda ayrılmasın diye birlikte gelir
        var cite = w.classList.contains("cite") ? w : w.querySelector(".cite");
        later(function () { w.classList.add("on"); if (cite) cite.classList.add("on"); }, t);
        t += cite ? 380 : 55 + Math.random() * 45;
      });
      t += 300;
      sources.forEach(function (li) {
        later(function () { li.classList.add("on"); }, t);
        later(function () { li.classList.add("settled"); }, t + 1600);
        t += 420;
      });
      later(function () { replay.hidden = false; }, t + 400);
    }

    replay.addEventListener("click", play);

    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); play(); }
    }, { threshold: 0.35 });
    // İlk karede metin görünmesin diye hazırlık sınıfı hemen eklenir
    chat.classList.add("chat-prep");
    io.observe(chat);
  }

  /* ---------- 3D sahne ---------- */
  // Performans sınırı yok (Feyzullah'ın kararı): her cihazda tam sahne. Yalnızca erişilebilirlik
  // ayarı (hareketi azalt) ve WebGL'in hiç olmaması sahneyi kapatır.
  function load3D() {
    if (reduce.matches) return;
    var test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) return;
    // Modül değil klasik betik: file:// ile açılınca da yüklenir (hatalar scene.js içinde yakalanır)
    var s = document.createElement("script");
    s.src = "scene.js";
    document.body.appendChild(s);
  }
  function whenIdle(fn) {
    if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 600);
  }

  setupTheme();
  setupReveal();
  setupDots();
  setupChat();
  if (document.readyState === "complete") whenIdle(load3D);
  else window.addEventListener("load", function () { whenIdle(load3D); });
})();
