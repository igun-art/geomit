<?php
// geomit yorum sistemi ayarları. Bu dosyada parola veya anahtar YOK; depo herkese açık.
// İmza anahtarı ilk çalışmada sunucuda üretilir (api/veri/gizli.php) ve depoya girmez.

define('SITE_ADRESI', 'https://geomit.net');
define('GONDEREN_EPOSTA', 'merhaba@geomit.net');
define('GONDEREN_AD', 'geomit');
define('YONETICI_EPOSTA', 'merhaba@geomit.net'); // Yorumlar onay için buraya gelir

define('KOD_SURESI', 900);        // Onay kodu 15 dakika geçerli
define('KOD_DENEME', 5);          // Bir kod için en fazla deneme
define('IP_SAATLIK', 6);          // Bir IP'den saatte en fazla kod isteği
define('EPOSTA_SAATLIK', 3);      // Bir e-postaya saatte en fazla kod

// Bu adreslerden gelen istekler kabul edilir (başka sitenin formu buraya gönderemesin)
$GLOBALS['IZINLI_ALANLAR'] = array('geomit.net', 'www.geomit.net', 'localhost', '127.0.0.1');
