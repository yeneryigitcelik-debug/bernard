// Türkçe mesaj kataloğu.
// Anahtarlar en.js ile birebir aynı olmalı. {token} ifadeleri makeT() ile doldurulur.
// Not: tip değerleri (decision/architecture/bug/preference/note) ve komut adları
// kanonik (İngilizce) kalır; yalnızca çevre metin Türkçeleşir.

export const tr = {
  "inspect.usage": "Kullanım: bernard goster <id> [--json] (tam olarak bir kayıt kimliği gerekir).",
  "inspect.jsonNoValue": "--json değer almaz.",
  "inspect.notInitialized": "{dir} konumunda bernard deposu bulunamadı. Önce `bernard init` çalıştırın.",
  "inspect.notFound": "Kayıt bulunamadı: {id}",
  "inspect.ambiguous": "{id} kimliğinin {lines} satırlarında çelişen kopyaları var. İncelemeden önce `bernard doctor` ile düzeltin.",
  "inspect.state": "durum: {state}",
  "inspect.stateActive": "etkin",
  "inspect.stateInvalid": "geçersiz",
  "inspect.stateReplaced": "yerine geçen kayıt bağlı",
  "inspect.replacement": "yerine geçen: {id}",
  "inspect.source": "kaynak: {source}",
  "mcp.get.desc": "Tek bir kaydı tam kimliğiyle eksiksiz JSON olarak getirir; geçmiş dahildir (geçersiz veya yerine başkası geçmiş kayıtlar invalid/superseded_by alanlarını korur). Bir kaydı güncellemeden ya da geçersiz kılmadan önce incelemek için kullanın. Arama değildir.",
  "mcp.list.includeInvalid": "Varsayılan true (geçmiş dahil). Yalnızca etkin kayıtlar için false verin; geçersiz veya yerine başkası geçmiş kayıtlar hariç tutulur.",
  "doctor.layout.root_unreadable": "{path} kökü incelenemiyor: {error}",
  "doctor.layout.unreadable": "{path} okunamıyor: {error}",
  "doctor.layout.missing_dir": "{path} konumunda hafıza başlatılmamış; doğru proje kökünde bernard init çalıştırın.",
  "doctor.layout.missing_file": "Hafıza dosyası eksik: {file}.",
  "doctor.layout.gitignore_cache": ".bernard/.cache yerel dizini açıkça ignore edilmemiş.",
  "doctor.layout.gitattributes_union": "records.jsonl merge=union Git niteliği eksik.",
  "doctor.layout.cache_tracked": "Türetilmiş önbellek dosyaları Git tarafından izleniyor.",
  "doctor.records.invalid_utf8": "{lineNo}. satır geçersiz UTF-8 içeriyor. Özgün baytlar korundu.",
  "doctor.records.corrupt_json": "{lineNo}. satır geçerli JSON değil.",
  "doctor.records.schema_invalid": "{lineNo}. satır kayıt doğrulamasını geçemiyor: {errors}",
  "doctor.records.duplicate_id": "{id} kimliği {lineNos} satırlarında yineleniyor. Geçersiz kopyalar hariç tutulur; çakışan aktif kopyalar karantinaya alınır.",
  "doctor.records.no_trailing_newline": "Son satırda satır sonu karakteri yok.",
  "doctor.records.mixed_eol": "Dosyada LF ve CRLF birlikte kullanılıyor; mevcut baytlar korundu.",
  "doctor.graph.superseded_by_missing": "{lineNo}. satır: {id}, eksik {by} kaydına işaret ediyor.",
  "doctor.graph.superseded_by_self": "{lineNo}. satır: {id} kendisini geçersizleştiriyor.",
  "doctor.graph.cycle": "Geçersizleştirme döngüsü: {ids}",
  "doctor.graph.valid_but_superseded": "{lineNo}. satır: {id} için yerine geçen kayıt var ama hâlâ geçerli işaretlenmiş.",
  "doctor.config.unparseable": "config.json geçerli bir ayar nesnesi değil.",
  "doctor.config.locale_unknown": "Bilinmeyen yapılandırılmış dil: {locale}",
  "doctor.config.retrieval_range": "Geçersiz arama ayarları: {fields}",
  "doctor.categories.unparseable": "categories.json geçerli bir nesne değil.",
  "doctor.categories.types_diverge": "Kategoriler her standart kayıt türünü tam bir kez içermeli.",
  "doctor.categories.synonyms_shape": "Eş anlamlılar anahtarları metin dizileriyle eşlemeli.",
  "doctor.cache.version_mismatch": "Önbellek biçimi {actual} eski; güncel biçim {expected}.",
  "doctor.cache.stale": "Arama önbelleği eksik veya eski; doktor yeniden oluşturmadı.",
  "doctor.lock.present": "{path} konumunda depo kilidi var; sahip durumu: {state}. Kaldırılmadı.",
  "doctor.lock.breaker_present": "{path} konumunda eski kilit açıcı var; kaldırılmadı.",
  "doctor.hook.state": "Post-commit kancası durumu: {kind}",
  "doctor.reconcile": "{lines} satırlarını inceleyip geçmişlerini elle uzlaştırın, sonra bernard doktor komutunu yeniden çalıştırın. Otomatik onarım yapılmaz.",
  "doctor.summary": "{errors} hata, {warnings} uyarı, {infos} bilgi; {records} geçerli satır, {unique_ids} benzersiz kimlik, {quarantined_ids} karantinadaki kimlik.",

  "store.duplicateLines": "\"{id}\" kimliği {lines} satırlarında yineleniyor; çakışan aktif kopyalar okumalardan çıkarılır. bernard doktor çalıştırıp bu satırları elle uzlaştırın.",
  "store.ambiguousUpdate": "\"{id}\" kaydının çakışan kopyaları güncellenemez. bernard doktor çalıştırın, bildirilen satırları elle uzlaştırıp tekrar deneyin. Özgün baytlar değiştirilmedi.",
  "cli.flagNeedsValue": "{flag} seçeneği boş olmayan bir değer gerektirir.",
  "mcp.notInitialized": "{dir} konumunda hafıza başlatılmamış. Yazmadan önce doğru proje kökünde bernard init çalıştırın. Dosya oluşturulmadı.",
  "add.notInitialized": "{dir} konumunda hafıza ayarları eksik; CLI add eski otomatik oluşturma davranışını korur. Ayarlar, kategoriler ve Git ignore/merge kuralları için bernard init çalıştırın.",
  "distill.ttyHint": "--apply etkileşimli terminal gerektirir; hiçbir kayıt değiştirilmedi.",
  "tags.unreadable": "{path} güvenle düzenlenemiyor/okunamıyor: {error}. Dosyayı elle düzeltin; mevcut kategoriler korundu.",

  // Storage validation and concurrency diagnostics.
  "store.invalidRecord": "Geçersiz kayıt: {errors}",
  "store.invalidLine": "Geçersiz kayıt satırı atlanıyor: {line} ({errors})",
  "store.invalidUtf8": "Geçersiz UTF-8 içeren satır atlanıyor ({bytes} bayt); orijinal baytlar korunuyor.",
  "store.duplicateId": "\"{id}\" kimlikli bir kayıt zaten var.",
  "store.patchNotObject": "Yama bir nesne olmalıdır.",
  "store.idImmutable": "Kayıt kimliği değiştirilemez.",
  "store.supersedeSelf": "\"{id}\" kaydı kendisinin yerine geçemez.",
  "store.supersedeMissing": "Yerine geçecek \"{id}\" kaydı bulunamadı.",
  "store.supersedeCycle": "\"{id}\" kaydının yerine \"{by}\" koymak bir döngü oluşturur.",
  "store.lockOwnerUnknown": "bilinmeyen sahip",
  "store.lockTimeout": "{path} depo kilidi için {ms} ms beklendikten sonra zaman aşımı (sahibi: {owner}).",
  "store.lockGarbled": "{ms} ms sonra zaman aşımı: {path} kilit dosyasının içeriği okunamıyor ve sahibi belirlenemiyor. Çalışan bir bernard işlemi yoksa {path} dosyasını elle silin.",
  "store.lockBreakerStuck": "{ms} ms sonra zaman aşımı: {path} eski kilit kırıcı dosyası mevcut (sahibi: {owner}). Bu dosya asla otomatik silinmez. Çalışan bir bernard işlemi yoksa {path} dosyasını (ve sahibi ölmüşse {lock} dosyasını) elle silin.",
  "store.lockLost": "{path} depo kilidi bırakılırken artık bize ait değildi.",
  "schema.idRequired": "Kimlik zorunludur ve boş olmayan bir metin olmalıdır.",
  "schema.createdInvalid": "Oluşturulma tarihi geçerli bir tarih metni olmalıdır.",
  "schema.invalidBoolean": "invalid alanı mantıksal (boolean) bir değer olmalıdır.",
  "schema.supersededByInvalid": "superseded_by null ya da boş olmayan bir metin olmalıdır.",
  "schema.sourceString": "Kaynak bir metin olmalıdır.",
  "store.indexWriteFailed": "Yerel arama dizini yazılamadı: {error}",

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
  show       (alias: goster)    Bir kaydı tam kimliğiyle eksiksiz incele [--json]
  invalidate (alias: gecersiz)  Bir kaydı geçersiz kılar (silmez)
  distill    (alias: damit)     Çelişkileri / geçersiz zincirleri çıkarır
  suggest    (alias: oner)      Son commit'lerden taslak kayıt önerir
  install-hook (alias: kanca-kur)  post-commit hatırlatıcı kancasını kurar/kaldırır
  doctor (doktor)              Salt okunur bütünlük kontrolü [--json]; çıkış: 0 sağlıklı, 1 uyarı, 2 hata, 3 çalıştırılamadı
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
  bernard doctor --json
  bernard stats
  bernard tags --add "auth=giris,oturum"
  bernard install-hook
`,
};
