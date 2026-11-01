/* geomit: müşteri yorumları sayfası. Yorumları sunucudan alır, formu iki adımda gönderir
   (önce e-postaya onay kodu, sonra kodun doğrulanması). Sunucuya ulaşılamazsa form kapanır;
   sayfanın kendi metni HTML'de durur. Yorum metni yalnızca textContent ile yazılır. */
(function () {
  "use strict";

  var API = "../api/yorum.php";
  var formu = document.getElementById("yorum-formu");
  var kodFormu = document.getElementById("kod-formu");
  var durum = document.getElementById("form-durum");
  var kapali = document.getElementById("form-kapali");
  var liste = document.getElementById("yorum-listesi");
  var bos = document.getElementById("yorum-bos");
  var kayitId = "";

  function goster(mesaj, hata) {
    durum.textContent = mesaj;
    durum.classList.toggle("hata", !!hata);
  }

  function gonder(veri) {
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(veri).toString()
    }).then(function (y) { return y.json(); });
  }

  function tarihYazi(t) {
    var p = t.split("-");
    var aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    return Number(p[2]) + " " + aylar[Number(p[1]) - 1] + " " + p[0];
  }

  function parca(etiket, sinif, metin) {
    var el = document.createElement(etiket);
    if (sinif) el.className = sinif;
    if (metin) el.textContent = metin;
    return el;
  }

  function ciz(yorumlar) {
    yorumlar.forEach(function (y) {
      var kart = parca("article", "compare-col");
      var puan = parca("p", "yorum-puan", "★★★★★".slice(0, y.puan) + "☆☆☆☆☆".slice(0, 5 - y.puan));
      puan.setAttribute("aria-label", "5 üzerinden " + y.puan + " puan");
      kart.appendChild(puan);
      kart.appendChild(parca("p", "", y.yorum));
      kart.appendChild(parca("p", "yorum-kim", y.firma ? y.ad + " · " + y.firma : y.ad));
      kart.appendChild(parca("p", "yorum-tarih", tarihYazi(y.tarih)));
      liste.appendChild(kart);
    });
    if (yorumlar.length) {
      liste.hidden = false;
      bos.hidden = true;
    }
  }

  function formuKapat() {
    kapali.hidden = false;
    formu.querySelector("button").disabled = true;
  }

  fetch(API + "?islem=liste")
    .then(function (y) { if (!y.ok) throw new Error(); return y.json(); })
    .then(function (v) { if (!v.ok) throw new Error(); ciz(v.yorumlar); })
    .catch(formuKapat);

  formu.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!formu.reportValidity()) return;
    var dugme = formu.querySelector("button");
    var veri = { islem: "kod-gonder" };
    new FormData(formu).forEach(function (deger, ad) { veri[ad] = deger; });
    dugme.disabled = true;
    goster("Gönderiliyor...");
    gonder(veri).then(function (c) {
      dugme.disabled = false;
      if (!c.ok) { goster(c.mesaj, true); return; }
      kayitId = c.id;
      document.getElementById("kod-adres").textContent = veri.eposta;
      formu.hidden = true;
      kodFormu.hidden = false;
      goster("");
      kodFormu.elements.kod.focus();
    }).catch(function () {
      dugme.disabled = false;
      goster("Bağlantı kurulamadı. Lütfen tekrar deneyin.", true);
    });
  });

  kodFormu.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!kodFormu.reportValidity()) return;
    var dugme = kodFormu.querySelector("button");
    dugme.disabled = true;
    goster("Kontrol ediliyor...");
    gonder({ islem: "kod-onayla", id: kayitId, kod: kodFormu.elements.kod.value }).then(function (c) {
      dugme.disabled = false;
      if (!c.ok) { goster(c.mesaj, true); return; }
      kodFormu.hidden = true;
      goster("Teşekkürler. E-posta adresiniz doğrulandı, yorumunuzu okuduktan sonra yayınlayacağız.");
    }).catch(function () {
      dugme.disabled = false;
      goster("Bağlantı kurulamadı. Lütfen tekrar deneyin.", true);
    });
  });
})();
