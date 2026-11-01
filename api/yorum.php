<?php
/* geomit müşteri yorumları.
   Akış: form -> e-postaya 6 haneli kod -> kod doğrulanır -> yorum "bekliyor" olur ->
   yöneticiye onay bağlantısı gider -> yayınlanırsa listede görünür.
   Veritabanı yok: tek JSON dosyası (api/veri/). Dosya .php uzantılı ve ilk satırı exit olduğu için
   adresle açılsa bile içeriği görünmez; ayrıca klasörde erişim yasağı (.htaccess) var.
   E-posta adresi yayınlanmaz, yorum doğrulandıktan sonra yalnızca özeti (HMAC) saklanır.
   PHP 7.0 ve üstüyle çalışır, ek paket gerekmez. */

require __DIR__ . '/ayar.php';
date_default_timezone_set('Europe/Istanbul');

define('VERI_KLASORU', __DIR__ . '/veri');
define('VERI_DOSYASI', VERI_KLASORU . '/kayitlar.php');
define('GIZLI_DOSYASI', VERI_KLASORU . '/gizli.php');
define('KILIT_DOSYASI', VERI_KLASORU . '/kilit');
define('KORUMA', "<?php exit; ?>\n");

header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

/* ---------- Yardımcılar ---------- */
function cevap($veri, $kod = 200) {
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($veri, JSON_UNESCAPED_UNICODE);
    exit;
}

function hata($mesaj, $kod = 400) {
    cevap(array('ok' => false, 'mesaj' => $mesaj), $kod);
}

function metin($deger, $azami) {
    $s = trim(strip_tags((string) $deger));
    $s = preg_replace('/\s+/u', ' ', $s);
    return mb_substr((string) $s, 0, $azami, 'UTF-8');
}

function klasor_hazirla() {
    if (!is_dir(VERI_KLASORU) && !mkdir(VERI_KLASORU, 0750, true) && !is_dir(VERI_KLASORU)) {
        hata('Sunucuda veri klasörü oluşturulamadı.', 500);
    }
    $koruma = VERI_KLASORU . '/.htaccess';
    if (!file_exists($koruma)) {
        file_put_contents($koruma, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    }
}

function gizli_anahtar() {
    if (is_file(GIZLI_DOSYASI)) {
        return substr((string) file_get_contents(GIZLI_DOSYASI), strlen(KORUMA));
    }
    $anahtar = bin2hex(random_bytes(32));
    file_put_contents(GIZLI_DOSYASI, KORUMA . $anahtar, LOCK_EX);
    return $anahtar;
}

function imza($deger) {
    return hash_hmac('sha256', $deger, gizli_anahtar());
}

function veri_oku() {
    $bos = array('bekleyen' => array(), 'yorumlar' => array(), 'sayac' => array(), 'epostalar' => array());
    if (!is_file(VERI_DOSYASI)) {
        return $bos;
    }
    $veri = json_decode(substr((string) file_get_contents(VERI_DOSYASI), strlen(KORUMA)), true);
    return is_array($veri) ? array_merge($bos, $veri) : $bos;
}

function veri_yaz($veri) {
    $gecici = VERI_DOSYASI . '.yeni';
    file_put_contents($gecici, KORUMA . json_encode($veri, JSON_UNESCAPED_UNICODE));
    rename($gecici, VERI_DOSYASI);
}

// Aynı anda gelen iki istek birbirinin kaydını ezmesin
function kilitli($is) {
    klasor_hazirla();
    $k = fopen(KILIT_DOSYASI, 'c');
    flock($k, LOCK_EX);
    $veri = veri_oku();
    $sonuc = $is($veri);
    veri_yaz($veri);
    flock($k, LOCK_UN);
    fclose($k);
    return $sonuc;
}

function istemci_ip() {
    return isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? $_SERVER['HTTP_CF_CONNECTING_IP'] : $_SERVER['REMOTE_ADDR'];
}

// Saatlik sınır: sınır aşıldıysa false döner, aşılmadıysa sayar
function hak_var_mi(&$veri, $anahtar, $sinir) {
    $simdi = time();
    $liste = isset($veri['sayac'][$anahtar]) ? $veri['sayac'][$anahtar] : array();
    $liste = array_values(array_filter($liste, function ($t) use ($simdi) { return $t > $simdi - 3600; }));
    if (count($liste) >= $sinir) {
        $veri['sayac'][$anahtar] = $liste;
        return false;
    }
    $liste[] = $simdi;
    $veri['sayac'][$anahtar] = $liste;
    return true;
}

function temizle(&$veri) {
    $simdi = time();
    foreach ($veri['bekleyen'] as $id => $b) {
        if ($b['son'] < $simdi) { unset($veri['bekleyen'][$id]); }
    }
    foreach ($veri['sayac'] as $anahtar => $liste) {
        if (max($liste) < $simdi - 3600) { unset($veri['sayac'][$anahtar]); }
    }
}

function eposta_gonder($alici, $konu, $govde) {
    $basliklar = 'From: ' . GONDEREN_AD . ' <' . GONDEREN_EPOSTA . ">\r\n"
        . 'Reply-To: ' . GONDEREN_EPOSTA . "\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit";
    $konu = '=?UTF-8?B?' . base64_encode($konu) . '?=';
    if (@mail($alici, $konu, $govde, $basliklar, '-f' . GONDEREN_EPOSTA)) {
        return true;
    }
    return @mail($alici, $konu, $govde, $basliklar); // Bazı sunucular -f ayarına izin vermez
}

function izinli_kaynak_mi() {
    if (empty($_SERVER['HTTP_ORIGIN'])) {
        return true; // Tarayıcı dışı veya aynı sayfa formu
    }
    $alan = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
    return in_array($alan, $GLOBALS['IZINLI_ALANLAR'], true);
}

/* ---------- İşlemler ---------- */
function kod_gonder() {
    if (!empty($_POST['site'])) {
        cevap(array('ok' => true, 'id' => bin2hex(random_bytes(8)))); // Tuzak alan doluysa bot: sessizce geç
    }
    $ad = metin(isset($_POST['ad']) ? $_POST['ad'] : '', 60);
    $firma = metin(isset($_POST['firma']) ? $_POST['firma'] : '', 80);
    $eposta = mb_strtolower(trim(isset($_POST['eposta']) ? (string) $_POST['eposta'] : ''), 'UTF-8');
    $yorum = metin(isset($_POST['yorum']) ? $_POST['yorum'] : '', 1000);
    $puan = (int) (isset($_POST['puan']) ? $_POST['puan'] : 0);

    if (mb_strlen($ad, 'UTF-8') < 2) { hata('Adınızı yazın.'); }
    if (strlen($eposta) > 120 || !filter_var($eposta, FILTER_VALIDATE_EMAIL)) { hata('Geçerli bir e-posta adresi yazın.'); }
    if ($puan < 1 || $puan > 5) { hata('Puan seçin.'); }
    if (mb_strlen($yorum, 'UTF-8') < 20) { hata('Yorumunuz en az 20 karakter olmalı.'); }
    if (preg_match('~https?://|www\.~i', $yorum)) { hata('Yorumda bağlantı paylaşılamaz.'); }
    if (empty($_POST['kvkk'])) { hata('Aydınlatma metnini onaylayın.'); }

    $sonuc = kilitli(function (&$veri) use ($ad, $firma, $eposta, $yorum, $puan) {
        temizle($veri);
        $ozet = imza('e:' . $eposta);
        if (isset($veri['epostalar'][$ozet])) {
            return array('hata' => 'Bu e-posta adresiyle daha önce yorum yapılmış.');
        }
        if (!hak_var_mi($veri, 'i:' . imza('i:' . istemci_ip()), IP_SAATLIK)
            || !hak_var_mi($veri, 'e:' . $ozet, EPOSTA_SAATLIK)) {
            return array('hata' => 'Çok fazla deneme yapıldı. Bir saat sonra tekrar deneyin.', 'kod' => 429);
        }
        $id = bin2hex(random_bytes(8));
        $kod = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $veri['bekleyen'][$id] = array(
            'ad' => $ad, 'firma' => $firma, 'eposta' => $eposta, 'yorum' => $yorum, 'puan' => $puan,
            'kod' => imza($id . ':' . $kod), 'deneme' => 0, 'son' => time() + KOD_SURESI,
        );
        return array('id' => $id, 'eposta' => $eposta, 'kodMetni' => $kod);
    });

    if (isset($sonuc['hata'])) {
        hata($sonuc['hata'], isset($sonuc['kod']) ? $sonuc['kod'] : 400);
    }
    $govde = "Merhaba,\n\ngeomit müşteri yorumu onay kodunuz: " . $sonuc['kodMetni']
        . "\n\nKod 15 dakika geçerlidir. Bu işlemi siz yapmadıysanız e-postayı dikkate almayın.\n\ngeomit\n" . SITE_ADRESI . "\n";
    if (!eposta_gonder($sonuc['eposta'], 'geomit yorum onay kodu', $govde)) {
        hata('Onay kodu gönderilemedi. Lütfen daha sonra tekrar deneyin.', 502);
    }
    cevap(array('ok' => true, 'id' => $sonuc['id']));
}

function kod_onayla() {
    $id = isset($_POST['id']) ? preg_replace('/[^a-f0-9]/', '', (string) $_POST['id']) : '';
    $kod = isset($_POST['kod']) ? preg_replace('/\D/', '', (string) $_POST['kod']) : '';

    $sonuc = kilitli(function (&$veri) use ($id, $kod) {
        temizle($veri);
        if ($id === '' || !isset($veri['bekleyen'][$id])) {
            return array('hata' => 'Kodun süresi doldu. Formu yeniden gönderin.');
        }
        $b = &$veri['bekleyen'][$id];
        if (!hash_equals($b['kod'], imza($id . ':' . $kod))) {
            $b['deneme']++;
            if ($b['deneme'] >= KOD_DENEME) {
                unset($veri['bekleyen'][$id]);
                return array('hata' => 'Çok fazla yanlış deneme. Formu yeniden gönderin.');
            }
            return array('hata' => 'Kod yanlış.');
        }
        $yorumId = bin2hex(random_bytes(8));
        $belirtec = bin2hex(random_bytes(24));
        $veri['yorumlar'][$yorumId] = array(
            'ad' => $b['ad'], 'firma' => $b['firma'], 'puan' => $b['puan'], 'yorum' => $b['yorum'],
            'tarih' => date('Y-m-d'), 'durum' => 'bekliyor', 'belirtec' => imza($belirtec),
        );
        $veri['epostalar'][imza('e:' . $b['eposta'])] = $yorumId;
        $bilgi = $b + array('yorumId' => $yorumId, 'belirtec' => $belirtec);
        unset($veri['bekleyen'][$id]);
        return $bilgi;
    });

    if (isset($sonuc['hata'])) {
        hata($sonuc['hata']);
    }
    $baglanti = SITE_ADRESI . '/api/yorum.php?islem=karar&id=' . $sonuc['yorumId'] . '&t=' . $sonuc['belirtec'];
    $govde = "Yeni müşteri yorumu var. E-posta adresi doğrulandı.\n\n"
        . 'Ad: ' . $sonuc['ad'] . "\nİşletme: " . $sonuc['firma'] . "\nE-posta: " . $sonuc['eposta']
        . "\nPuan: " . $sonuc['puan'] . "/5\n\n" . $sonuc['yorum']
        . "\n\nYayınlamak veya reddetmek için:\n" . $baglanti . "\n";
    eposta_gonder(YONETICI_EPOSTA, 'geomit: onay bekleyen yorum', $govde);
    cevap(array('ok' => true));
}

function liste() {
    $veri = veri_oku();
    $cikti = array();
    foreach ($veri['yorumlar'] as $y) {
        if ($y['durum'] === 'yayinda') {
            $cikti[] = array('ad' => $y['ad'], 'firma' => $y['firma'], 'puan' => $y['puan'], 'yorum' => $y['yorum'], 'tarih' => $y['tarih']);
        }
    }
    usort($cikti, function ($a, $b) { return strcmp($b['tarih'], $a['tarih']); });
    cevap(array('ok' => true, 'yorumlar' => $cikti));
}

function html_kacis($s) {
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

function karar_sayfasi($baslik, $icerik) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' . html_kacis($baslik) . '</title>'
        . '<style>body{font:17px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px}'
        . 'button{font:inherit;padding:10px 18px;margin:12px 8px 0 0;cursor:pointer}blockquote{margin:16px 0;padding:12px 16px;background:#f2f4f8}</style>'
        . '</head><body><h1>' . html_kacis($baslik) . '</h1>' . $icerik . '</body></html>';
    exit;
}

// Karar GET ile verilmez: e-posta tarayıcıları bağlantıyı önceden açar, yorum kendiliğinden yayınlanmasın
function karar() {
    $id = isset($_REQUEST['id']) ? preg_replace('/[^a-f0-9]/', '', (string) $_REQUEST['id']) : '';
    $belirtec = isset($_REQUEST['t']) ? preg_replace('/[^a-f0-9]/', '', (string) $_REQUEST['t']) : '';
    $veri = veri_oku();
    if ($id === '' || !isset($veri['yorumlar'][$id]) || !hash_equals($veri['yorumlar'][$id]['belirtec'], imza($belirtec))) {
        http_response_code(403);
        karar_sayfasi('Bağlantı geçersiz', '<p>Bu bağlantı geçerli değil.</p>');
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $secim = isset($_POST['karar']) ? $_POST['karar'] : '';
        if ($secim !== 'yayinla' && $secim !== 'reddet') {
            hata('Geçersiz seçim.');
        }
        kilitli(function (&$v) use ($id, $secim) {
            $v['yorumlar'][$id]['durum'] = $secim === 'yayinla' ? 'yayinda' : 'reddedildi';
        });
        karar_sayfasi('Kaydedildi', '<p>Yorum ' . ($secim === 'yayinla' ? 'yayınlandı.' : 'yayından kaldırıldı.') . '</p>');
    }
    $y = $veri['yorumlar'][$id];
    $durumlar = array('bekliyor' => 'Onay bekliyor', 'yayinda' => 'Yayında', 'reddedildi' => 'Yayında değil');
    $form = '<form method="post"><input type="hidden" name="islem" value="karar">'
        . '<input type="hidden" name="id" value="' . html_kacis($id) . '"><input type="hidden" name="t" value="' . html_kacis($belirtec) . '">'
        . '<button name="karar" value="yayinla">Yayınla</button><button name="karar" value="reddet">Yayından kaldır / reddet</button></form>';
    karar_sayfasi('Müşteri yorumu', '<p>Durum: ' . html_kacis($durumlar[$y['durum']]) . '</p>'
        . '<p><strong>' . html_kacis($y['ad']) . '</strong> ' . html_kacis($y['firma']) . ' · ' . (int) $y['puan'] . '/5 · ' . html_kacis($y['tarih']) . '</p>'
        . '<blockquote>' . html_kacis($y['yorum']) . '</blockquote>' . $form);
}

/* ---------- Yönlendirme ---------- */
$islem = isset($_REQUEST['islem']) ? (string) $_REQUEST['islem'] : '';
$yontem = $_SERVER['REQUEST_METHOD'];

if ($yontem === 'GET' && $islem === 'durum') {
    klasor_hazirla();
    cevap(array('ok' => true, 'yazilabilir' => is_writable(VERI_KLASORU), 'mail' => function_exists('mail')));
}
if ($yontem === 'GET' && $islem === 'liste') { liste(); }
if ($islem === 'karar') { klasor_hazirla(); karar(); }
if ($yontem === 'POST' && izinli_kaynak_mi()) {
    if ($islem === 'kod-gonder') { kod_gonder(); }
    if ($islem === 'kod-onayla') { kod_onayla(); }
}
hata('Geçersiz istek.', 404);
