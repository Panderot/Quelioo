# Quelio

Yapay zekâ ile metin, dosya, URL ve YouTube içeriğinden quiz üreten web uygulaması (MCQ, Doğru/Yanlış, Boşluk Doldurma, SSS vb.). Slogan: "Questions that shine."

## Stack

Vite + React + TypeScript + Tailwind CSS (v4, `@tailwindcss/vite`) + react-i18next (en/tr). Geliştirme: `npm run dev`. Derleme: `npm run build`. Lint: `npm run lint`.

## Proje kuralları

- Hedef pazar: Türkiye ve global. Arayüz EN, TR ve HYW (Batı Ermenicesi) desteklemeli; tüm metinler i18n dosyalarından gelmeli, etiketlere sabit genişlik verilmemeli (Türkçe ve Ermenice metinler daha uzun olabilir).
- HYW (Batı Ermenicesi) metinleri geniş yayından önce anadili Batı Ermenicesi olan biri tarafından gözden geçirilmeli.
- Tasarım kaynağı `design.md` dosyasıdır. Renk, tipografi, boşluk ve bileşen kararları orada tanımlıdır. Yeni bileşen gerekirse önce `design.md`'ye ekle, sonra kullan.
- Ana ekranda üçüncü taraf reklam, kurucu iletişim satırı veya çapraz uygulama tanıtımı olmamalı.
- Birincil CTA ("Generate Quiz") düz amber (turuncu-sarı) arka plan ve lacivert metinle gösterilir; ekran başına tek bir birincil CTA vardır. Arka planlarda ve butonlarda gradient kullanılmaz.
- Archive (`/archive`), backend gelene kadar quiz kayıtlarını tarayıcının localStorage'ında `quelio.archive.v1` anahtarı altında saklar.

## Context ve token kullanımı

- Önce görevi ve ilgili dosyaları belirle. Tüm projeyi baştan sona okuma.
- Dosya ararken hedefli aramalar yap; yalnızca gerekli dosyaları ve bölümleri aç.
- CLAUDE.md, DESIGN.md ve diğer uzun dokümanları her görevde yeniden okuma.
- Değişmemiş ve daha önce incelenmiş dosyaları tekrar okuma.
- Büyük logları, build çıktılarını ve test sonuçlarını bütünüyle paylaşma. İlgili hata satırlarını ve kısa bir özeti ver.
- Küçük görevlerde uzun planlar ve gereksiz açıklamalar üretmeden doğrudan uygula.
- İş bitince kısaca neyin değiştiğini, nasıl doğrulandığını ve varsa kalan sorunu belirt.
- Hata ayıklamak veya değişikliği güvenle yapmak için ek bilgi gerekiyorsa ilgili dosyayı ya da log bölümünü oku.

## Bilgilerin güncelliği

- Bu dosyada geçmiş görev özetleri, tamamlanmış işler, eski kararlar veya doğrulanmamış bilgiler tutulmasın.
- Yalnızca hâlâ geçerli olan proje kuralları, mimari kararlar ve çalışma talimatları burada yer alsın.
- Güncel durumu anlamak için mevcut kodu ve yapılandırmayı kontrol et. Bu dosyadaki bilgi onlarla çelişiyorsa eski bilgiyi düzelt.
- Her görev sonunda CLAUDE.md'ye otomatik olarak günlük veya ilerleme özeti ekleme.

## Dizin düzeni
- Yalnızca ihtiyaç duyulan dosya ve klasörleri oluştur; boş veya gereksiz yapılar ekleme.
- Yeni dosyaları mevcut düzene uygun yere koy; aynı iş için tekrar eden dosya oluşturma.
- Proje büyüdükçe dizini küçük adımlarla düzenle.

## Gerçek API verisi
- API bağlandıktan sonra arayüzde eski veya mock veriyi göstermeye devam etme; mock fallback'leri ve kullanılmayan örnek verileri kaldır.
- API yanıtlarını, kullanıcı verilerini veya eski test kayıtlarını proje dosyalarına, CLAUDE.md'ye ya da loglara kalıcı olarak yazma.
- Veri gelmezse uydurma içerik göstermek yerine uygun boş veya hata durumunu göster.
