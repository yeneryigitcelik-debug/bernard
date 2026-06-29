// Türkçe mesaj kataloğu.
// Anahtarlar en.js ile birebir aynı olmalı. {token} ifadeleri makeT() ile doldurulur.
// Not: tip değerleri (decision/architecture/bug/preference/note) ve komut adları
// kanonik (İngilizce) kalır; yalnızca çevre metin Türkçeleşir.

export const tr = {
  // --- ortak ---
  "common.noGitRepo": "Git deposu bulunamadı; geçerli dizin kullanılıyor.",
  "common.corruptLine": "Bozuk satır atlandı: {line}",
  "cli.unknownCommand": "Bilinmeyen komut: {sub}",

  "label.id": "id",
  "label.date": "tarih",
  "label.tags": "etiketler",
  "label.score": "skor",
  "label.none": "-",

  // --- şema doğrulama ---
  "schema.notObject": "Kayıt bir nesne olmalı.",
  "schema.invalidType": 'Geçersiz tip: "{type}". Geçerli tipler: {types}.',
  "schema.titleRequired": "Başlık boş olmayan bir metin olmalı.",
  "schema.contentString": "İçerik bir metin olmalı.",
  "schema.tagsArray": "Etiketler bir dizi olmalı.",
  "schema.tagsAllStrings": "Etiketlerin tümü metin olmalı.",
  "schema.invalidSource": 'Geçersiz kaynak: "{source}". Geçerli kaynaklar: {sources}.',

  // --- init ---
  "init.done": "Bellek başlatıldı: {dir}",
  "init.created": "Oluşturulanlar:",
  "init.skipped": "Atlananlar (zaten var):",
  "init.allInPlace": "Her şey zaten yerinde, değişiklik yapılmadı.",
  "init.success": "init tamamlandı",
  "init.gitignoreCreated": ".gitignore (oluşturuldu)",
  "init.gitignoreAdded": ".gitignore (.bernard/.cache/ eklendi)",
  "init.gitignoreContains": ".gitignore (zaten içeriyor)",
  "init.gitattrCreated": ".gitattributes (oluşturuldu)",
  "init.gitattrAdded": ".gitattributes (merge=union eklendi)",
  "init.gitattrContains": ".gitattributes (zaten içeriyor)",

  // --- add ---
  "add.promptType": "Tip ({types}): ",
  "add.promptTitle": "Başlık: ",
  "add.promptContent": "İçerik: ",
  "add.promptTags": "Etiketler (virgülle, opsiyonel): ",
  "add.invalidType": "Geçersiz tip. Şunlardan biri olmalı: {types}",
  "add.missingFields": "Eksik zorunlu alan(lar): {fields}",
  "add.usage": "Kullanım: bernard add --type <tip> --title <başlık> --content <içerik> [--tags a,b]",
  "add.supersedeNotFound": 'Geçersiz kılınacak kayıt bulunamadı: "{id}"',
  "add.validateFailed": "Kayıt doğrulanamadı:",
  "add.added": "Eklendi: {id} ({type}) {title}{tags}",
  "add.superseded": "Geçersiz kılındı: {old} -> yerine {new} geçti",

  // --- search ---
  "search.empty": "Sorgu boş. Kullanım: bernard search <sorgu> [--type ...] [--tag ...]",
  "search.indexFailed": "Index hazırlanamadı: {error}",
  "search.noResults": "Sonuç bulunamadı.",
  "search.header": '"{query}" için {n} sonuç:',

  // --- list ---
  "list.none": "Kayıt bulunamadı.",
  "list.invalid": "(geçersiz)",
  "list.total": "Toplam: {n} kayıt",

  // --- invalidate ---
  "invalidate.missingId": "Eksik kayıt id'si.",
  "invalidate.usage": "Kullanım: bernard invalidate <id> [--by <id2>]",
  "invalidate.notFound": "Kayıt bulunamadı: {id}",
  "invalidate.byNotFound": "--by kaydı bulunamadı: {id}",
  "invalidate.done": "Geçersiz kılındı: {id} ({title})",
  "invalidate.doneBy": "Geçersiz kılındı: {id} ({title}) — yerine geçen: {by}",

  // --- distill ---
  "distill.reportHeader": "Bellek damıtma raporu ({n} kayıt incelendi)",
  "distill.noDelete": "Not: Bu işlem hiçbir şeyi silmez; yalnızca işaretler ve önerir.",
  "distill.conflicts": "Olası çelişkiler: {n}",
  "distill.none": "(yok)",
  "distill.records": "kayıtlar: {ids}",
  "distill.keep": "tutulacak (en yeni): {id}",
  "distill.toInvalidate": "geçersiz kılınacaklar: {ids}",
  "distill.chains": "Geçersiz zincirleri: {n}",
  "distill.chainLine": "{id} -> {by} tarafından güncel kılınmış",
  "distill.suggestions": "Öneriler: {n}",
  "distill.suggestConflict":
    'Aynı "{type}" tipinde{tags} {count} kayıt var: {ids}. ' +
    'En yenisini ("{keep}") tutup diğerlerini ona işaret ederek geçersiz kılmayı düşünün.',
  "distill.suggestChain":
    '"{id}" kaydı geçersiz ve "{by}" tarafından güncel kılınmış; güncel kararın hâlâ geçerli olduğundan emin olun.',
  "distill.suggestConsistent":
    "Belirgin bir çelişki veya geçersiz zinciri bulunamadı; bellek tutarlı görünüyor.",
  "distill.tagsInline": " (etiketler: {tags})",
  "distill.readyHeader": "Çalıştırmaya hazır komutlar (hiçbir şey otomatik silinmez):",
  "distill.applyHint": "İpucu: Etkileşimli uygulamak için '--apply' bayrağını kullanın (TTY gerekir).",
  "distill.applyNoConflicts": "Uygulanacak çelişki bulunamadı.",
  "distill.conflictHeading": "Çelişki [{type}] etiketler: {tags}",
  "distill.applyPrompt": "En yenisini tut, diğerlerini geçersiz kıl? (e/h) ",
  "distill.applied": '"{old}" geçersiz kılındı; "{keep}" tarafından güncel kılındı.',
  "distill.skipped": "Atlandı.",
  "distill.completed": "Tamamlandı: {n} kayıt geçersiz kılındı (hiçbir şey silinmedi).",

  // --- suggest ---
  "suggest.notGitRepo": "Bu bir git deposu değil; öneri üretilemiyor.",
  "suggest.noCommits": "Önerilecek commit bulunamadı.",
  "suggest.header": "Son {n} commit'ten taslak öneri(ler):",
  "suggest.note1": "Not: Asıl anlayış sende (ajanda). Bunlar yalnızca bir başlangıç noktasıdır;",
  "suggest.note2": "kaydetmeden önce gözden geçir ve düzelt.",
  "suggest.labelType": "Tip",
  "suggest.labelTitle": "Başlık",
  "suggest.labelTags": "Etiketler",
  "suggest.labelContent": "İçerik",
  "suggest.none": "(yok)",
  "suggest.savePrompt": '[{i}/{n}] "{title}" — Kaydet? (e/h): ',
  "suggest.saved": "Kaydedildi: {id} ({type}) {title}",
  "suggest.skipped": "Atlandı.",
  "suggest.useAddHint": "Bu taslakları kaydetmek için 'bernard add' komutunu ya da MCP aracını kullan.",
  "suggest.ttyHint": "--add etkileşimli (TTY) gerektirir; yalnızca öneri gösterildi.",

  // --- install-hook ---
  "hook.notGitRepo": "Burası bir git deposu değil; kanca kurulamadı.",
  "hook.notGitRepoOut": "Git deposu bulunamadı. Kancayı kurmak için bir git deposunda olmalısınız.",
  "hook.removeNone": "Kaldırılacak post-commit kancası bulunamadı.",
  "hook.removeNoneDim": "install-hook --remove: yapılacak bir şey yok",
  "hook.removeNotOurs": "Mevcut post-commit kancası bernard tarafından kurulmamış; dokunulmadı.",
  "hook.removeNotOursOut": "post-commit kancası bernard işareti içermiyor, kaldırma yapılmadı.",
  "hook.removeFailed": "Kanca kaldırılamadı: {error}",
  "hook.removeFailedOut": "post-commit kancası kaldırılamadı.",
  "hook.removed": "bernard post-commit kancası kaldırıldı: {path}",
  "hook.removeSuccess": "install-hook --remove tamamlandı",
  "hook.alreadyInstalled": "bernard post-commit kancası zaten kurulu: {path}",
  "hook.noChange": "install-hook: değişiklik yapılmadı",
  "hook.existsNotOurs": "Mevcut post-commit kancası bernard'a ait değil; üzerine yazılmadı.",
  "hook.existsOut": "Zaten bir post-commit kancası var: {path}",
  "hook.snippetIntro": "Aşağıdaki satırları mevcut post-commit kancanıza elle ekleyebilirsiniz:",
  "hook.installFailed": "Kanca kurulamadı: {error}",
  "hook.installFailedOut": "post-commit kancası kurulamadı.",
  "hook.installed": "bernard post-commit kancası kuruldu: {path}",
  "hook.installedHint": "Her commit sonrası 'bernard suggest' çalıştırmanız hatırlatılacak.",
  "hook.success": "install-hook tamamlandı",
  "hook.reminder": "[bernard] Yeni commit kaydedildi. Taslak öneri için: bernard suggest",

  // --- stats ---
  "stats.title": "Bellek istatistikleri",
  "stats.total": "Toplam kayıt: {n}",
  "stats.empty": "Bellek henüz boş. 'bernard add' ile ilk kaydını oluşturabilirsin.",
  "stats.byType": "Tip dağılımı:",
  "stats.topTags": "En aktif 5 etiket:",
  "stats.noTags": "(etiket yok)",
  "stats.invalidCount": "Geçersiz kayıt sayısı: {n}",
  "stats.oldest": "En eski kayıt: {date}",
  "stats.newest": "En yeni kayıt: {date}",
  "stats.noDates": "Tarih aralığı: (geçerli tarih yok)",
  "stats.bySource": "Kaynak dağılımı:",

  // --- tags ---
  "tags.invalidAddFormat": 'Geçersiz biçim. Kullanım: --add "anahtar=es1,es2"',
  "tags.emptyKey": 'Geçersiz biçim: anahtar boş olamaz. Kullanım: --add "anahtar=es1,es2"',
  "tags.groupUpdated": "Eş anlamlı grubu güncellendi: {key}: {syns}",
  "tags.success": "etiketler güncellendi",
  "tags.invalidRemoveFormat": 'Geçersiz biçim. Kullanım: --remove "anahtar"',
  "tags.groupRemoved": "Eş anlamlı grubu kaldırıldı: {key}",
  "tags.groupNotFound": "Eş anlamlı grubu bulunamadı: {key}",
  "tags.typesHeader": "Tipler:",
  "tags.noTypes": "(tanımlı tip yok)",
  "tags.synonymsHeader": "Eş anlamlı gruplar:",
  "tags.noSynonyms": "(tanımlı eş anlamlı grup yok)",

  // --- mcp araç açıklamaları ---
  "mcp.search.desc":
    "Bu projedeki geçmiş kararları, mimari notları, çözülmüş bug'ları ve tercihleri ara. Bir şeye başlamadan önce ilgili geçmiş bağlamı bulmak için kullan.",
  "mcp.add.desc":
    "Bu projeyle ilgili yeni bir kararı, mimari notu, çözülmüş bir bug'ı, tercihi ya da notu belleğe kaydet. İleride bu bağlamın hatırlanması gerektiğinde kullan.",
  "mcp.list.desc":
    "Bellekteki kayıtları listele; istersen tip ya da etikete göre filtrele. Projede nelerin kayıtlı olduğunu görmek için kullan.",
  "mcp.invalidate.desc":
    "Bir kaydı geçersiz (artık geçerli değil) olarak işaretle. İsteğe bağlı olarak onu geçersiz kılan yeni kaydın id'sini ver. Kayıt silinmez, sadece işaretlenir.",
  "mcp.update.desc":
    "Var olan bir kaydın alanlarını (tip, başlık, içerik, etiketler) güncelle. Yalnızca verilen alanlar değişir.",
  "mcp.suggest.desc":
    "Son commit'leri ve diff'lerini getir ki kaydedilmeye değer kararları/bug'ları çıkarıp bernard_add ile kaydedebilesin.",
  "mcp.noResults": "Sonuç yok.",
  "mcp.invalidRecord": "Kayıt geçersiz, eklenmedi:\n- {errors}",
  "mcp.added": "Kayıt eklendi: {id} [{type}] {title}",
  "mcp.noRecords": "Kayıt yok.",
  "mcp.notFound": "Kayıt bulunamadı: {id}",
  "mcp.invalidated": "Kayıt geçersiz kılındı: {id} [{type}] {title}{by}",
  "mcp.invalidatedBy": " (geçersiz kılan: {by})",
  "mcp.updated": "Kayıt güncellendi: {id} [{type}] {title}",
  "mcp.notGitRepo": "Bu dizin bir git deposu değil; commit önerisi yapılamıyor.",
  "mcp.noCommits": "Hiç commit bulunamadı.",
  "mcp.suggestIntro":
    "Son commit'ler ve değişiklikleri aşağıda. Kaydedilmeye değer kararları/bug'ları/mimari notları çıkarıp bernard_add ile kaydet:",
  "mcp.serverRunning": "bernard MCP sunucusu stdio üzerinde çalışıyor.",

  // --- cli yardımı ---
  "help.text": `bernard — repoya commit'lenen, proje-bazlı AI hafızası (CLI + MCP)

Kullanım:
  bernard <komut> [seçenekler]

Komutlar:
  init                          Bu repoda .bernard/ yapısını oluşturur
  add        (alias: ekle)      Yeni bir hafıza kaydı ekler
  search     (alias: ara)       Kayıtlarda arama yapar (BM25 tam-metin)
  list       (alias: listele)   Kayıtları (en yeni önce) listeler
  invalidate (alias: gecersiz)  Bir kaydı geçersiz kılar (silmez)
  distill    (alias: damit)     Çelişkileri / geçersiz zincirleri çıkarır
  suggest    (alias: oner)      Son commit'lerden taslak kayıt önerir
  install-hook (alias: kanca-kur)  post-commit hatırlatıcı kancasını kurar/kaldırır
  stats      (alias: istatistik)   Özet panosunu gösterir
  tags       (alias: etiketler)    Tip / eş anlamlı gruplarını yönetir
  mcp                           MCP sunucusunu (stdio) başlatır

Seçenekler:
  --type <tip>                  decision | architecture | bug | preference | note
  --title <metin>               Kayıt başlığı
  --content <metin>             Kayıt içeriği
  --tags <a,b,c>                Virgülle ayrılmış etiketler
  --supersedes <eskiId>         (add) yeni kayıt eski kaydı geçersiz kılar
  --by <id2>                    (invalidate) yerine geçen kaydın id'si
  --apply                       (distill) çelişkileri etkileşimli geçersiz kıl
  --add                         (suggest) önerileri etkileşimli kaydet
  --n <sayı>                    (suggest) işlenecek commit sayısı
  --remove                      (install-hook) bernard kancasını kaldırır
  --locale <en|tr>              Çıktı dili (ayrıca: BERNARD_LOCALE ortam değişkeni)
  -h, --help                    Bu yardımı gösterir
  -v, --version                 Sürümü gösterir

Örnekler:
  bernard init
  bernard add --type decision --title "JWT kullan" --content "Oturum yerine JWT" --tags auth,api
  bernard search "kimlik doğrulama akışı"
  bernard search "ödeme" --type decision
  bernard list --type bug
  bernard invalidate ber_abc123 --by ber_def456
  bernard distill --apply
  bernard suggest --add
  bernard stats
  bernard tags --add "auth=giris,oturum"
  bernard install-hook
`,
};
