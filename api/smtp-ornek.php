<?php
// Örnek dosya. Gerçek parola bu dosyaya YAZILMAZ; depo herkese açık.
// Sunucuda aynı içerikle api/veri/smtp.php dosyasını oluştur, kutu adını ve parolayı orada doldur.
// api/veri/ zip'e ve depoya girmez, yeni zip yüklenince üzerine yazılmaz.
// Parolada yalnızca harf ve rakam kullan: tırnak işareti bu dosyayı bozar.

define('SMTP_SUNUCU', 'localhost');
define('SMTP_PORT', 587);                        // 465 baştan şifreli, diğerleri STARTTLS
define('SMTP_KULLANICI', 'merhaba@geomit.net');  // cPanel'de açılan posta kutusu
define('SMTP_PAROLA', 'PAROLAYI-BURAYA-YAZ');
