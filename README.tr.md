# bernard

**Repoya commit'lenen, proje-bazlı, kodlama ajanları için AI hafızası — sıfır API anahtarı, sıfır embedding, sıfır harici servis.**

[![npm version](https://img.shields.io/npm/v/bernard-mcp.svg)](https://www.npmjs.com/package/bernard-mcp)
[![CI](https://github.com/yeneryigitcelik-debug/bernard/actions/workflows/ci.yml/badge.svg)](https://github.com/yeneryigitcelik-debug/bernard/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/bernard-mcp.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 🇬🇧 [English README](README.md)

`bernard`, kod tabanınızın **takım hafızasıdır**. Verdiğiniz kararları, mimari notları, çözdüğünüz bug'ları ve oturttuğunuz tercihleri repo içinde düz metin (JSONL) olarak saklar. Sonra siz veya bir AI ajanı, yeni bir işe başlamadan önce bu bağlamı saniyeler içinde geri çağırır. Bilgi, kodla aynı yerde — git'te — yaşar: commit edilir, versiyonlanır, review'dan geçer ve takımca paylaşılır.

AI kodlama ajanlarına (Claude Code, Cursor ve [MCP](https://modelcontextprotocol.io) konuşan her şey) bir **MCP sunucusu** olarak bağlanır; böylece ajan geçmiş kararları kendisi arar, yeni kararları kendisi kaydeder.

```jsonc
// .bernard/records.jsonl — commit'lenir, her satır bir JSON nesnesi
{"id":"ber_a1b2c3","type":"decision","title":"Postgres'e geçtik","content":"MySQL → Postgres; JSONB ve daha iyi indeksleme için.","tags":["db"],"created":"2026-06-27T10:00:00Z","invalid":false,"superseded_by":null,"source":"manual"}
```

---

## Neden bernard?

Bir `memory.md` dosyası çürür: yapısız, sorgulanamaz ve kimse onu budamaz. Bulut tabanlı "ajan hafızası" ürünleri ise API anahtarı ister, kod bağlamınızı üçüncü tarafa gönderir ve abonelik bitince yok olur.

bernard tam tersini yapar:

- **Reponuzda yaşar.** Repoyu klonla, hafıza da gelsin. Çalıştırılacak bir servis, sağlanacak bir altyapı yok.
- **Sıfır API anahtarı, sıfır embedding, sıfır ağ çağrısı.** Her şey yerel dosyalar + saf algoritma.
- **Yapısal ve sorgulanabilir.** Tipli kayıtlar, etiketler, eş anlamlılar, tarih ağırlığı ve geçersizleştirme — düz bir yığın değil.
- **MCP-yerel.** Ajanınız onu otomatik kullanır; CLI'a nadiren dokunursunuz.
- **Doğası gereği gizli.** Veri repodan çıkmaz; bu yüzden varsayılan olarak KVKK/GDPR dostudur.

## API anahtarı olmadan akıllı

"API anahtarı yok" ama nasıl hâlâ akıllı? Zekâ iki yerden gelir ve ikisi de ağ gerektirmez:

1. **Ajanın kendisi.** Claude Code gibi bir ajan zaten yeteneklidir. bernard'ın işi *anlamak* değil — **doğru geçmiş kayıtları ajanın önüne koymaktır**. bernard getirir, ajan akıl yürütür.
2. **BM25 getirme.** Klasik, sağlam, bağımlılıksız bir tam-metin sıralama algoritması; üzerine **eş anlamlı genişletme** (örn. `login` → `auth`), **tarih ağırlığı** (yeni kararlar öne) ve **kayıt geçersizleştirme** (eskiyen kararlar elenir). Hepsi yerel, hepsi anında.

İkisi arasındaki köprü bernard'dır. Anahtar yok, abonelik yok, gizlilik sızıntısı yok.

## Hızlı başlangıç (Claude Code ile)

```bash
# Projenizde hafıza deposunu bir kez kurun:
npx -y bernard-mcp init
```

bernard'ı projenizin `.mcp.json` dosyasına bir MCP sunucusu olarak ekleyin:

```json
{
  "mcpServers": {
    "bernard": {
      "command": "npx",
      "args": ["-y", "bernard-mcp", "mcp"]
    }
  }
}
```

Hepsi bu. Ajanınız artık bir işe başlamadan önce `bernard_search`, karar kaydetmek için `bernard_add` çağırabilir. `.bernard/` dizinini commit edin; takım arkadaşlarınız aynı hafızayı devralır.

## Kurulum

`npx` ile anında (kurulum yok):

```bash
npx -y bernard-mcp <komut>
```

Ya da `bernard` komutu için global kurun:

```bash
npm i -g bernard-mcp
bernard --help
```

Ya da dev bağımlılığı olarak ekleyin:

```bash
npm i -D bernard-mcp
```

**Node.js ≥ 20** gerekir.

## CLI kullanımı

Her komutun bir İngilizce adı ve bir Türkçe alias'ı vardır (örn. `add` / `ekle`). Çıktı dili locale'inize göre belirlenir — bkz. [Uluslararasılaştırma](#uluslararasılaştırma).

### Başlat

```bash
bernard --locale tr init
```

Oluşturur (mevcut dosyaların üzerine **yazmaz**):

- `.bernard/records.jsonl` — kayıtlar (JSONL, **commit'lenir**)
- `.bernard/categories.json` — tipler + eş anlamlılar (**commit'lenir**)
- `.bernard/config.json` — proje ayarları (**commit'lenir**)
- `.gitignore`'a `.bernard/.cache/` ekler
- `.gitattributes`'a `.bernard/records.jsonl merge=union` ekler

> `--locale tr` ile başlatınca proje locale'i `tr` olarak kaydedilir ve takım için Türkçe çıktı varsayılan olur.

### Kayıt ekle

```bash
bernard add --type decision --title "Postgres'e geçtik" \
  --content "MySQL → Postgres; JSONB ve daha iyi indeksleme için." \
  --tags db,architecture
```

`bernard add` komutunu bayraksız çalıştırırsanız terminalde size tek tek sorar.

### Ara

```bash
bernard search kimlik doğrulama akışı
bernard search "token yenileme" --type bug
bernard search migrasyon --tag db
```

Her sonuç skor, tip, başlık, tarih, etiketler ve kısa içerikle yazdırılır.

### Listele

```bash
bernard list
bernard list --type decision
bernard list --tag auth
```

Liste geçmişi de içerir; geçersiz kayıtları ve yerlerine geçen kimlikleri belirtir.
Arama/liste tip filtreleri, bilinmeyen tipte sessizce boş sonuç dönmek yerine geçerli
seçenekleri gösterir. Etiket filtresi tam eşleşme davranışını korur.

### Kaydı eksiksiz incele

```bash
bernard show <kayit-id>
bernard show <kayit-id> --json
bernard goster <kayit-id> --json --locale tr
```

Arama veya listeden aldığınız tam kimlikle içeriğin tamamını okuyabilirsiniz.
`show --json`, bilinmeyen alanlar, `invalid` ve `superseded_by` dahil yalnızca tam
kaydı yazdırır; arama ve liste kısa görünümler olarak kalır. İnceleme geçmişi de
içerir; kaydı güncel bağlam olarak kullanmadan veya güncellemeden önce durumuna bakın.
Eksik depo oluşturulmaz, önbellek yeniden kurulmaz ve kayıt baytları değiştirilmez.

Aynı kimliğin farklı kopyaları, biri geçersiz olsa bile tek bir kesin kayıt olarak
incelenemez. `bernard doctor` çalıştırıp bildirilen satırları elle uzlaştırın.
Özdeş kopyalar incelenebilir; hiçbir kopya onarılmaz veya silinmez.

### Geçersiz kıl

```bash
bernard invalidate ber_abc123
bernard invalidate ber_abc123 --by ber_def456
```

Bir kaydı **silmeden** geçersiz işaretler (`invalid: true`). `--by` ile onu güncelleyen yeni kaydı bağlarsınız; böylece karar geçmişi korunur. Arama, geçersiz kayıtları varsayılan olarak eler.

Eski bir kararı doğrudan geçersiz kılan yeni bir kayıt eklemek için:

```bash
bernard add --type decision --title "Param'a geçtik" \
  --content "Önceki sağlayıcıdan daha iyi komisyon." --tags payment \
  --supersedes ber_abc123
```

### Damıt

```bash
bernard distill
bernard distill --apply
```

Olası çelişkileri (aynı tip + boş olmayan etiket grubunda birden çok kayıt), geçersiz zincirlerini ve önerileri gösterir. Etiketsiz kayıtlar ve ayrı `bug` olayları çakışma önerilerinden hariç tutulur; ortak tür/etiket tek başına çelişki kanıtı değildir. Her çelişki için **en yenisini tut, diğerlerini geçersiz kıl** önerir ve çalıştırmaya hazır `bernard invalidate … --by …` komutları üretir. `--apply` (TTY) bunları etkileşimli uygular. **Hiçbir şeyi silmez** — yalnızca işaretler ve önerir.

### Bütünlük kontrolü (salt okunur)

```bash
bernard doctor
bernard doctor --json
bernard doktor --locale tr
```

Kaynak satırlarını, yinelenen kimlikleri, geçersizleştirme bağlantılarını/döngülerini,
ayarları, kategorileri, Git ignore/merge kurallarını, izlenen önbelleği, önbellek
geçerliliğini, kilitleri ve kanca sahipliğini denetler. Kayıtları onarmaz; kilit almaz
veya kaldırmaz; depo/önbellek oluşturmaz. JSON çıktısı `schema: 1`, `summary`, sabit
İngilizce tanı `id` alanları, yerelleştirilmiş mesajlar, satır numaraları ve `exitCode`
içerir. Çıkış kodları: **0** sağlıklı (yalnız bilgi), **1** uyarı, **2** veri/yapı
hatası, **3** kök okunamıyor. `summary.records` geçerli fiziksel satırları sayar;
`unique_ids` ve `quarantined_ids` tekrarları açıkça gösterir. Bildirilen yinelenen
satırları inceleyip geçmişlerini elle uzlaştırın, ardından `doktor` komutunu yeniden
çalıştırın. Otomatik onarım veya silme yapılmaz.

### İstatistik

```bash
bernard stats
```

Özet pano: toplam kayıt, tip dağılımı, en aktif 5 etiket, geçersiz sayısı, en eski/en yeni tarih ve kaynak (manuel/agent) dağılımı.

### Etiketler (eş anlamlı yönetimi)

```bash
bernard tags
bernard tags --add "auth=giris,oturum"
bernard tags --remove "auth"
```

`categories.json` içindeki tipleri ve eş anlamlı gruplarını listeler/düzenler. Eş anlamlılar arama sırasında sorgu genişletmeyi besler; takımın söz dağarcığı takımın geri çağırma gücü olur.

Yeni projelerde etiketleri düzenlemeden önce `init` çalıştırılır. Önceki sürümlerden kalan bağımsız `categories.json` dosyaları uyumluluk için düzenlenebilir.

### Öner (commit'lerden taslak)

```bash
bernard suggest --n 3
bernard suggest --add
```

Son commit'lerden taslak kayıtlar üretir: başlıktan tip tahmini (`feat→decision`, `fix→bug`, `refactor→architecture`, `docs/chore→note`) ve değişen dizinlerden etiketler. Bu yalnızca bir başlangıçtır — asıl anlayış ajandadır. `--add` (TTY) taslakları onayınızla kaydeder.

### Kanca kur (post-commit hatırlatıcı)

```bash
bernard install-hook
bernard install-hook --remove
```

`.git/hooks/post-commit` içine, her commit sonrası `bernard suggest` çalıştırmayı hatırlatan, işaretli ve idempotent bir kanca kurar. bernard'a ait olmayan bir kancanın üzerine yazmaz (elle eklenecek snippet'i gösterir). `--remove` yalnızca bernard'ın kancasını kaldırır.

## MCP entegrasyonu (ana yol)

bernard'ın asıl gücü bir AI ajanına bağlanmasıdır. Bir **MCP sunucusu** olarak, ajanın otomatik kullandığı yedi araç sunar — bir işe başlamadan önce geçmiş kararları arar, yenilerini kaydeder, eskiyenleri geçersiz kılar.

Projenizin `.mcp.json` dosyasına ekleyin:

```json
{
  "mcpServers": {
    "bernard": {
      "command": "npx",
      "args": ["-y", "bernard-mcp", "mcp"]
    }
  }
}
```

Global kurduysanız binary'i doğrudan kullanın:

```json
{
  "mcpServers": {
    "bernard": {
      "command": "bernard",
      "args": ["mcp"]
    }
  }
}
```

Sunucunun sunduğu araçlar:

| Araç | Ne yapar |
|------|----------|
| **`bernard_search`** | Geçmiş kararları, mimari notları, çözülmüş bug'ları ve tercihleri arar. Anahtar araç — ajan işe başlamadan önce çağırır. |
| **`bernard_add`** | Yeni kayıt ekler (`source: "agent"`); yazmadan önce şema doğrular. |
| **`bernard_list`** | Kayıtları durumları ve yerlerine geçen kimliklerle, isteğe bağlı tip/etiket filtresiyle listeler. Geçmiş varsayılan olarak dahildir; `include_invalid: false`, geçersiz veya yerine geçen kayıt bağlı olanları eler. |
| **`bernard_get`** | Tam `id` ile geçmiş durumu ve bütün alanları içeren eksiksiz JSON kaydını inceler. Salt okunurdur; farklı kopyalar elle uzlaştırılmalıdır. |
| **`bernard_invalidate`** | Bir kaydı geçersiz kılar (`id`, opsiyonel `by`). Silmez, işaretler. |
| **`bernard_update`** | Var olan bir kaydın alanlarını günceller; yalnızca verilen alanlar değişir. |
| **`bernard_suggest`** | Son commit'leri + diff'leri getirir ki ajan kaydedilmeye değer kayıtları çıkarsın. |

Herhangi bir MCP istemcisiyle (Claude Code, Cursor ve diğerleri) çalışır — config bloğu aynıdır, yalnızca o istemcinin MCP sunucularını okuduğu yere konur.

## Veri modeli

Kayıtlar `.bernard/records.jsonl` içinde, her satır bir JSON nesnesi olacak şekilde tutulur:

```json
{
  "id": "ber_a1b2c3d4",
  "type": "decision",
  "title": "Postgres'e geçtik",
  "content": "MySQL → Postgres; JSONB ve daha iyi indeksleme için.",
  "tags": ["db", "architecture"],
  "created": "2026-06-27T10:00:00.000Z",
  "invalid": false,
  "superseded_by": null,
  "source": "manual"
}
```

Kayıt tipleri:

| type | Anlamı |
|------|--------|
| `decision` | Verilen bir karar |
| `architecture` | Mimari not / yapısal bilgi |
| `bug` | Çözülmüş bir bug ve çözümü |
| `preference` | Stil / yaklaşım tercihi |
| `note` | Serbest not |

JSONL satır-bazlıdır: append ucuzdur, git diff temiz kalır (her kayıt ayrı satır), makine-dostudur ve yine de `git log -p` ile insan okuyabilir.

### Geçersizleştirme yaşam döngüsü

bernard bilgiyi asla silmez; eskiyen kararları **geçersizleştirir** ve geçmişi korur. Yeni bir karar (gerekirse `--supersedes` ile) eskisini bağlayarak eklenir; ajan da bunu `bernard_add` + `bernard_invalidate` ile yapabilir. Zamanla `bernard distill` çelişkileri yüzeye çıkarır ve en yeniyi tutup diğerlerini geçersiz kılan hazır komutlar verir. Geçersiz kayıtlar dosyada kalır ama aramadan elenir; `superseded_by` zinciri "bu neden değişti?" sorusunu yanıtlar.

### Takımca paylaşım (merge=union)

`init`, bir `.gitattributes` satırı ekler:

```
.bernard/records.jsonl merge=union
```

Her kayıt, ekleme-öncelikli bir dosyada bağımsız bir satır olduğundan, iki dal farklı kayıtlar eklediğinde git iki tarafı **birleştirir** (union) — böylece aynı anda hafızaya yazan takım üyeleri gereksiz merge çatışmaları yaşamaz.

Bir dal satırı güncellerken diğer dal yakınına kayıt eklerse union merge aynı kimliği
**birden fazla satırda** bırakabilir. Bernard bütün kaynak baytlarını korur ve satır
numaralarını bildirir: aynı kopyalar bir kez sayılır; herhangi bir kopya geçersizse o
kimlik aramada hariç kalır. Farklı kopyaların hepsi aktifse rastgele bir dalın içeriği
seçilmez; kimlik **arama, liste, istatistik ve distill sonuçlarından karantinaya alınır**.
CLI okumaları stderr'e uyarı yazar; MCP arama/liste yanıtları da tanıyı içerir.
Çakışan kopyalar güncellenemez; diğer kayıtlar kullanılmaya devam eder. Aynı kopyalara
açık bir yama her kopyayı kendi satır sonunu koruyarak günceller. `bernard doktor`
çalıştırın ve yinelenen satırları elle uzlaştırın; okumalar dosyayı yeniden yazmaz.
Önbellek biçimi 3, JSONL parmak izi değişmese de eski indeksleri geçersiz sayar.

Okuma komutları eksik depoyu oluşturmaz. MCP yazmaları mevcut kayıt dosyası gerektirir;
sunucuyu doğru proje kökünde başlatın ve önce orada `bernard init` çalıştırın. CLI `add`,
ayarlar ve Git kuralları için `init` uyarısı vererek önceki otomatik oluşturma davranışını
korur. `add --supersedes`, yeni kaydı ekleme ve eskiyi geçersizleştirme işlemlerini tek
kilitli, atomik yazmayla yapar. `--by` olmadan tekrar geçersizleştirme mevcut yerine geçen
kayıt bağlantısını korur. Distill, etiketsiz kayıtları ve ayrı `bug` olaylarını çakışma
önerilerine dahil etmez; tür/etiket ortaklığı tek başına çelişki kanıtı değildir.

## Mimari: neyin commit edildiği, neyin yerel kaldığı

```
projeniz/
├── .git/
├── .gitignore                 # .bernard/.cache/ buraya eklenir
├── .gitattributes             # .bernard/records.jsonl merge=union
├── .mcp.json                  # ajan entegrasyonu (commit edilir)
└── .bernard/
    ├── records.jsonl          # COMMIT EDİLİR — paylaşılan hafıza
    ├── categories.json        # COMMIT EDİLİR — tipler + eş anlamlılar
    ├── config.json            # COMMIT EDİLİR — proje ayarları
    └── .cache/                # YEREL — gitignore'da
        └── index.json         # BM25 indeksi (türetilir, otomatik kurulur)
```

**Commit edilir:** `records.jsonl`, `categories.json`, `config.json`. Hafıza koddur — paylaşılmalı, review edilmeli ve git geçmişiyle versiyonlanmalı.

**Yerel yazımlar:** Aynı çalışma kopyasındaki CLI ve MCP yazıcıları ortak kilit kullanır; JSONL atomik olarak değiştirilir. Eşzamanlı yazıcılar sınırlı süre bekler, etkin kilit zorla alınmaz. Bu mekanizma farklı bilgisayarları koordine etmez ve Git birleştirme çatışmalarını çözmez. Bozuk veya geçersiz satırlar aramada atlanır, elle onarım için diskte korunur.

**Yerel kalır:** `.bernard/.cache/`. BM25 `index.json` tamamen `records.jsonl`'dan türetilebilir (kayıtlar veya locale değişince otomatik yeniden kurulur). Türetilmiş veriyi commit etmek yalnızca anlamsız çatışmalar yaratır.

## Uluslararasılaştırma

bernard **iki dilli** gelir: İngilizce (varsayılan) ve Türkçe. Tüm kullanıcıya dönük çıktı yerelleştirilir; komut adları İngilizce kalır (Türkçe alias'larla) ve kararlı tanımlayıcılar (kayıt tipleri, alan adları) kanonik kalır.

Locale önceliği (yüksekten düşüğe):

1. `--locale <en|tr>` bayrağı (örn. `bernard --locale tr stats`)
2. `BERNARD_LOCALE` ortam değişkeni
3. `.bernard/config.json` içindeki `locale` (`init`'te belirlenir, commit'lenir → takım geneli)
4. `en` (varsayılan)

Getirme de locale-duyarlıdır: Türkçe için muhafazakâr bir stemmer (`tokenları` → `token` eşleşir), İngilizce için küçük-harf tokenizasyonu (recall'ı BM25 + eş anlamlılar taşır).

## Yapılandırma

`.bernard/config.json`:

```json
{
  "project": "uygulamam",
  "locale": "tr",
  "retrieval": {
    "max_results": 8,
    "recency_weight": 0.3,
    "half_life_days": 30,
    "type_weights": {
      "decision": 1.2,
      "architecture": 1.2,
      "bug": 1.0,
      "preference": 1.0,
      "note": 0.9
    }
  }
}
```

- `recency_weight` — yeni kayıtların ne kadar öne çıkacağı.
- `half_life_days` — tarih bonusunun ne hızla söneceği.
- `type_weights` — tip bazlı sıralama çarpanları.

## Yol haritası

- **Opsiyonel yerel embedding (Ollama)** — BM25 varsayılan ve anahtarsız kalır; isteyene tamamen yerel, anahtarsız anlamsal katman.
- **Commit/diff'ten otomatik çıkarım** — git geçmişinden doğrudan karar/mimari kaydı öner.
- **Takım çelişki çözümü** — `distill`'in bulduğu çelişkiler için takımca akış: işaretle, tartış, geçersiz kıl.
- **`distill` otomasyonu** — pre-commit hook veya CI ile düzenli damıtma ve uyarılar.

## Katkı

Katkılar memnuniyetle karşılanır — bkz. [CONTRIBUTING.md](CONTRIBUTING.md). Proje bilerek bağımlılık-hafiftir (yalnızca sunucu için MCP SDK + zod) ve çevrimdışı smoke testlerinin yanında kayıt, arama, hook ve gerçek MCP protokol regresyonlarını içerir:

```bash
npm ci
npm test
```

Ayrıca [Davranış Kuralları](CODE_OF_CONDUCT.md) ve [Güvenlik Politikası](SECURITY.md) belgelerini de okuyun.

## Lisans

[MIT](LICENSE) © Yener Yiğit Çelik

---

*Generated değil — crafted.*
