# Paylaşım

Üçüncü sınıf ders notları, çalışma dosyaları ve etkileşimli sorular. [Canlı site](https://bismillah-ikra.github.io/)

## Yerelde çalıştırma

Node.js 24 ve Chrome veya Chromium gerekir. Tarayıcı farklı bir konumdaysa `PDF_CHROME` ile yolunu belirt.

```sh
npm run build
npm test
python -m http.server 8080 --directory dist
```

Önizlemeyi `http://localhost:8080/` adresinden aç. Derleme, ders arşivini ve katalog dosyasını `dist/` içine yazar. Ayrıca her dersin soru PDF’sini güncel soru verisinden oluşturur.

## Ders dosyalarını güncelleme

PDF’yi `pdf-archive/<ders>/<ders-notlari veya calisma-dosyalari>/` altına ekle. Dosya adının başında `01.`, `02.` gibi hafta numaraları kullan. Derleme, mevcut Word arşivindeki eşleşen belgeleri de indirilebilir dosya olarak hazırlar.

## Yayın

`main` dalına gönderilen değişiklikler GitHub Actions ile derlenir ve testler geçince GitHub Pages’te yayınlanır. İlerlemeyi [Actions sayfasından](https://github.com/bismillah-ikra/bismillah-ikra.github.io/actions) izleyebilirsin.
