/** Original source texts (400-600 words) for the real-AI audit of the written exam, one per subject (public-domain verse only where literature asks for it). */

export interface AuditSource {
  /** Folder name under ../QUELIO-TEST-EXAM */
  folder: string
  course: string
  /** Header grade: "4", "7" ... or "Üniversite". */
  grade: string
  outputLanguage: 'auto' | 'tr' | 'en'
  text: string
}

export const TURKCE_4: AuditSource = {
  folder: 'turkce-4',
  course: 'Türkçe',
  grade: '4',
  outputLanguage: 'auto',
  text: `Bir hikâyeyi güzel yapan şey, içindeki unsurların birbirine uyumudur. Hikâye unsurları dörttür: yer, zaman, kişi ve olay. Yer, olayların geçtiği mekândır. Bir hikâye okulda, evde, ormanda ya da deniz kıyısında geçebilir. Zaman, olayın ne zaman yaşandığını gösterir. Sabah, akşam, bir yaz günü ya da kış mevsimi hikâyenin zamanını belirtir. Kişiler, hikâyede yer alan insanlar, hayvanlar ya da varlıklardır. Hikâyenin kahramanına baş kişi, ona yardım eden ya da karşı çıkan diğer kişilere ise yan kişi denir. Olay, kişilerin başından geçen ve hikâyeyi ilerleten durumlardır.

Her hikâye üç bölümden oluşur. Giriş bölümünde yer, zaman ve kişiler tanıtılır. Gelişme bölümünde olay ilerler, sorun ortaya çıkar. Sonuç bölümünde sorun çözülür ve hikâye biter. Okuduğumuz hikâyeyi anlatırken bu bölümleri sırasıyla söylersek özetimiz düzenli olur.

Yazarken kelimeleri doğru kullanmak da önemlidir. Anlamları aynı ya da çok yakın olan kelimelere eş anlamlı kelimeler denir. Örneğin "güzel" ile "hoş", "okumak" ile "mütalaa etmek" eş anlamlıdır. Anlamları birbirine karşıt olan kelimelere ise zıt anlamlı kelimeler denir. "Uzun" kelimesinin zıttı "kısa", "sıcak" kelimesinin zıttı "soğuk" kelimesidir. Yazılışları aynı, anlamları farklı olan kelimeler de vardır. Bunlara eş sesli kelimeler denir. "Yüz" kelimesi hem yüzmek eylemini hem de çehreyi hem de sayıyı anlatabilir. "Çay" kelimesi hem içeceği hem de küçük akarsuyu ifade eder.

Cümleleri doğru yazmak için noktalama işaretlerini bilmek gerekir. Cümlenin sonuna anlamına göre nokta, soru işareti ya da ünlem konur. Bir bilgiyi bildiren cümlenin sonuna nokta konur: "Kedi çatıya çıktı." Soru bildiren cümlenin sonuna soru işareti konur: "Bugün hava nasıl?" Sevinç, şaşkınlık ve kızgınlık gibi duyguları anlatan cümlelerin sonuna ünlem işareti konur: "Ne güzel bir resim!" Aynı türden kelimeleri sıralarken aralarına virgül konur: "Sepete elma, armut, üzüm ve kiraz koydum."

Büyük harflerin kullanıldığı yerleri de unutmamalıyız. Cümleler büyük harfle başlar. Özel isimler büyük harfle yazılır. İnsanlara verilen adlar, şehir, ülke, nehir ve dağ adları özel isimdir. Örneğin Ayşe, Ankara, Kızılırmak ve Erciyes özel isimlerdir. Cins isimler ise aynı türdeki varlıkların ortak adıdır ve küçük harfle yazılır: kız, şehir, nehir, dağ gibi. Bir kitabın okunması sırasında bilmediğimiz kelimelerle karşılaşırsak sözlüğe bakabiliriz. Sözlük, kelimelerin alfabe sırasına göre dizildiği ve anlamlarının yazıldığı kitaptır. Sözlükte kelimeleri ararken ilk harfe, sonra ikinci harfe göre sıra izlenir.`,
}

export const MATEMATIK_7: AuditSource = {
  folder: 'matematik-7',
  course: 'Matematik',
  grade: '7',
  outputLanguage: 'auto',
  text: `İki çokluğun birbirine bölünmesiyle elde edilen sonuca oran denir. a ve b iki sayı olmak üzere b sıfırdan farklı iken a/b ifadesi bu sayıların oranıdır. Örneğin bir sınıfta 12 kız ve 18 erkek öğrenci varsa kızların erkeklere oranı 12/18 olur ve sadeleştirilince 2/3 bulunur. Oranın birimleri aynı olmalıdır. Aynı cinsten iki büyüklüğün oranı birimsizdir.

İki oranın eşitliğine orantı denir. a/b = c/d eşitliğinde içler çarpımı dışlar çarpımına eşittir: a·d = b·c. Bu özellik bilinmeyen bir terimi bulmak için kullanılır. Örneğin 3/5 = x/20 orantısında 5·x = 3·20 olduğundan 5x = 60 ve x = 12 bulunur.

Doğru orantıda bir çokluk artarken diğeri de aynı oranda artar. Bir kitapçıda 4 defter 24 liraya satılıyorsa 10 defter için 24·10/4 = 60 lira ödenir. Ters orantıda ise bir çokluk artarken diğeri aynı oranda azalır. Bir işi 6 işçi 10 günde bitiriyorsa aynı işi 15 işçi 6·10/15 = 4 günde bitirir, çünkü işçi sayısı arttıkça gün sayısı azalır.

Yüzde, paydası 100 olan kesirdir. %25 ifadesi 25/100 ya da 0,25 olarak yazılır. Bir sayının yüzdesini bulmak için sayı, yüzde ile çarpılır ve 100'e bölünür. 80 sayısının %15'i 80·15/100 = 12'dir. Bir çokluğun diğerine göre yüzde kaç olduğunu bulmak için iki sayı bölünür, sonuç 100 ile çarpılır. 40 kişilik bir sınıfta 10 kız öğrenci varsa kızlar sınıfın 10/40·100 = %25'idir.

İndirim ve zam problemlerinde yüzde hesabı sık kullanılır. Etiket fiyatı 200 lira olan bir ayakkabıya %20 indirim yapılırsa indirim tutarı 200·20/100 = 40 liradır ve yeni fiyat 200 − 40 = 160 lira olur. Fiyatı 50 lira olan bir ürüne %10 zam yapılırsa zam tutarı 5 lira, yeni fiyat 55 liradır. Kâr ve zarar hesabında maliyet fiyatı ile satış fiyatı karşılaştırılır. Maliyeti 120 lira olan bir mal 150 liraya satılırsa kâr 30 liradır ve kâr yüzdesi 30/120·100 = %25 olur. Bir malı maliyetinin altında satarsak zarar etmiş oluruz.

Basit faiz hesabında faiz, anapara, yıllık faiz oranı ve süre çarpılarak bulunur. 2000 lira anapara %10 yıllık faizle 3 yıl bankada kalırsa faiz 2000·10·3/100 = 600 lira olur. Orantı konularında doğru orantı ile ters orantıyı karıştırmamak için önce iki çokluğun aynı yönde mi yoksa zıt yönde mi değiştiğine bakılır.`,
}

export const FEN_6: AuditSource = {
  folder: 'fen-6',
  course: 'Fen Bilimleri',
  grade: '6',
  outputLanguage: 'auto',
  text: `Güneş, Dünya ve Ay üçlüsü birbirleriyle sürekli etkileşim hâlindedir. Güneş bir yıldızdır; kendi ışığını yayar. Dünya ve Ay ise kendi ışığı olmayan gök cisimleridir ve Güneş'ten aldıkları ışığı yansıtırlar. Dünya, Güneş'in çevresinde bir yılda tam bir dolanım yapar. Ay ise Dünya'nın çevresinde yaklaşık 27 günde bir dolanır ve Dünya'nın uydusudur.

Ay'ın Güneş'ten gelen ışığı yansıtan yarısı hep aydınlıktır. Ay Dünya'nın çevresinde dolanırken biz bu aydınlık yüzün farklı kısımlarını görürüz. Bu farklı görünümlere Ay'ın evreleri denir. Ay'ın Dünya'dan bakıldığında hiç görünmediği evreye yeni ay, yarısının aydınlık göründüğü evreye ilk dördün, tamamının aydınlık göründüğü evreye dolunay denir. Dolunaydan sonra aydınlık kısım küçülür ve son dördün evresi oluşur. Ay'ın evreleri yaklaşık 29,5 günde kendini tekrar eder.

Güneş, Dünya ve Ay aynı doğru üzerinde bulunduğunda tutulmalar meydana gelir. Ay, Güneş ile Dünya'nın arasına girdiğinde Güneş'in ışığı Dünya'nın bazı yerlerine ulaşamaz. Bu olaya Güneş tutulması denir. Güneş tutulması yalnızca yeni ay evresinde olabilir. Dünya, Güneş ile Ay'ın arasına girdiğinde ise Ay Dünya'nın gölgesine girer ve Ay tutulması gerçekleşir. Ay tutulması yalnızca dolunay evresinde olur. Güneş tutulması Dünya'nın çok küçük bir bölümünden izlenirken Ay tutulması gece yarısında bulunan herkes tarafından izlenebilir.

Dünya kendi ekseni etrafında dönerken Güneş'e dönük olan yüzü gündüz, dönük olmayan yüzü gece yaşar. Dünya'nın kendi çevresindeki dönüşü yaklaşık 24 saat sürer. Dünya'nın eksen eğikliği ve Güneş etrafındaki dolanımı mevsimleri oluşturur. Kuzey Yarım Küre'de Güneş ışınları yaz aylarında dik açıya yakın gelir, bu yüzden hava sıcak olur. Kış aylarında ise ışınlar daha eğik gelir ve hava soğur.

Gök cisimlerini incelemek için teleskop kullanılır. Teleskoplar uzaktaki cisimleri daha büyük ve parlak göstererek ayrıntıları görmemizi sağlar. Uzay araştırmalarında uydular da önemli rol oynar. Yapay uydular Dünya'nın çevresinde döner ve hava durumunu izleme, haberleşme ve konum belirleme gibi işlerde kullanılır. İlk yapay uydu olan Sputnik 1957 yılında uzaya gönderilmiştir. Ay'a ayak basan ilk insan ise 1969 yılında Neil Armstrong'dur. Güneş sisteminde Güneş'in çevresinde dönen sekiz gezegen vardır. Merkür, Venüs, Dünya ve Mars kayaç yapılı iç gezegenlerdir. Jüpiter, Satürn, Uranüs ve Neptün ise gazlardan oluşan dış gezegenlerdir.`,
}

export const SOSYAL_7: AuditSource = {
  folder: 'sosyal-7',
  course: 'Sosyal Bilgiler',
  grade: '7',
  outputLanguage: 'auto',
  text: `İstanbul'un fethi, Osmanlı Devleti'nin yükselme sürecinde dönüm noktasıdır. Fatih Sultan Mehmet 1451 yılında tahta çıktığında İstanbul'u almak için hazırlıklara başladı. Bizans'ın başkenti İstanbul, hem kara hem deniz surlarıyla çevrili bir kentti ve o güne kadar birçok kuşatmaya direnmişti. Şehrin Osmanlı topraklarının ortasında yer alması ise yeni bir devletin güvenliği için bir sorundu.

Fatih, fetih öncesi ilk olarak Boğaz'ın Avrupa yakasında Rumeli Hisarı'nı yaptırdı. Hisar, yaklaşık dört ayda tamamlandı. Bu hisar sayesinde Karadeniz'den gelecek yardım gemilerinin geçişi kontrol altına alındı. Aynı dönemde Macar mühendis Urban'a büyük toplar döktürüldü. Bu toplar surları yıkacak güçteydi ve Şahi topları olarak anıldı. Osmanlı ordusu yaklaşık yüz binin üzerinde asker ve çok sayıda gemiden oluşuyordu.

Kuşatma 6 Nisan 1453 tarihinde başladı. Bizans, Haliç'in girişini büyük bir zincirle kapatmıştı; bu nedenle Osmanlı donanması Haliç'e giremiyordu. Fatih, gemileri Galata yönünde karadan yürüterek Haliç'e indirmeye karar verdi. Yağlanmış kızaklar üzerinde gemiler bir gecede karadan çekildi ve sabah Haliç'te göründü. Bu hamle Bizans'ı şaşırttı. Kuşatma yaklaşık elli üç gün sürdü. 29 Mayıs 1453'te yapılan genel saldırıda surlar aşıldı ve şehir alındı. Bizans'ın son imparatoru XI. Konstantinos savaşırken öldü.

İstanbul'un alınmasıyla Orta Çağ sona erdi, Yeni Çağ başladı. Tarihçiler fetih tarihini bu dönemin başlangıcı olarak kabul eder. Fatih, kenti Osmanlı'nın yeni başkenti yaptı ve şehre hızla yeniden canlandıran adımlar attı. Ayasofya camiye çevrildi. Farklı din ve milletten insanlar şehre yerleştirildi. Rum Ortodoks Kilisesi'nin Patrikhane olarak varlığını sürdürmesine izin verildi; bu uygulama Osmanlı'nın hoşgörü anlayışının bir örneğidir.

Fetih sonrası Fatih, imar çalışmalarına da önem verdi. Kente yeni camiler, medreseler, hamamlar ve çarşılar yapıldı. Fatih Külliyesi dönemin en önemli yapılarından biri oldu. Yine bu dönemde Kapalıçarşı'nın ilk bölümleri inşa edildi. İstanbul, kısa sürede ticaretin, bilimin ve kültürün merkezi hâline geldi. Fatih, Rumeli'de ve Anadolu'da fetihlerini sürdürdü; Trabzon, Bosna ve Karaman'ın bir bölümü onun döneminde Osmanlı'ya katıldı. Böylece Osmanlı Devleti Anadolu ve Rumeli'yi birleştirerek bir dünya devleti olma yolunda büyük adımlar attı. Fetih, ticaret yollarının Avrupalılar için zorlaşmasına yol açtı ve onları yeni deniz yolları aramaya yöneltti; bu arayışlar coğrafi keşiflere giden süreci hızlandırdı.`,
}

export const INGILIZCE_8: AuditSource = {
  folder: 'ingilizce-8',
  course: 'İngilizce',
  grade: '8',
  outputLanguage: 'en',
  text: `Healthy habits are important for teenagers because the body and the brain are still growing. Experts say that teenagers need between eight and ten hours of sleep every night. When students sleep less than that, they find it hard to concentrate at school and they feel tired during the day. A regular bedtime helps the body to get used to sleeping at the same hour. It is better to avoid screens for at least thirty minutes before going to bed, because the light from phones and tablets can make it difficult to fall asleep.

Exercise is another key part of a healthy life. Doctors recommend at least sixty minutes of physical activity every day for young people. This does not mean that everyone must join a sports team. Walking to school, riding a bike, dancing or playing football in the park are all good ways to stay active. Regular exercise makes the heart and the muscles stronger, helps people to sleep better and improves their mood. Many students say that they feel more relaxed after a walk or a game with friends.

A balanced diet gives the body the energy it needs. A healthy plate includes vegetables, fruit, whole grains, protein and a little dairy. Breakfast is the most important meal of the day because it gives energy for the morning lessons. Students who skip breakfast often feel hungry and cannot focus. Sugary drinks and fast food are not forbidden, but they should be eaten only sometimes. Drinking enough water is also essential. Teenagers should drink about six to eight glasses of water a day, and more when the weather is hot or when they do sports.

Mental health matters as much as physical health. Everybody feels stressed sometimes, especially before exams. Talking to a friend, a parent or a teacher can help. Hobbies such as reading, drawing or playing a musical instrument give the mind a break. Spending too much time on social media can make some teenagers feel lonely or worried, so it is a good idea to set limits on screen time. Many schools now organise clubs and counselling hours to support their students.

Finally, good hygiene prevents illness. Washing hands with soap for at least twenty seconds before meals and after using the toilet removes germs. Brushing teeth twice a day protects them from decay, and a visit to the dentist once a year is recommended. If students feel ill, they should stay at home and rest so that they do not infect their classmates. Small daily choices, such as sleeping on time, moving more, eating well and asking for help, build a healthy life for the future.`,
}

export const EDEBIYAT_10: AuditSource = {
  folder: 'edebiyat-10',
  course: 'Türk Dili ve Edebiyatı',
  grade: '10',
  outputLanguage: 'auto',
  text: `Halk edebiyatı, halkın içinden çıkan ve sözlü gelenekle yaşayan edebiyat koludur. Bu edebiyatın ürünleri üç ana grupta toplanır: anonim halk edebiyatı, âşık edebiyatı ve tekke edebiyatı. Anonim halk edebiyatında eserin şairi bilinmez; ürünler ağızdan ağıza aktarılırken değişir ve toplumun ortak malı olur. Mâniler, ninniler, türküler, atasözleri, bilmeceler, masallar ve halk hikâyeleri bu gruptadır. Mâni, genellikle yedi heceli ve dört dizelik bir nazım biçimidir; ilk iki dize genelde hazırlık, son iki dize asıl anlamı taşır.

Âşık edebiyatı, saz eşliğinde söyleyen halk şairlerinin edebiyatıdır. Bu şairlere âşık ya da ozan denir. Âşıklar kendi şiirlerini bestelerler, düğünlerde, köy odalarında ve âşık kahvelerinde söylerler. Âşık edebiyatında şiirler genellikle hece ölçüsüyle yazılır. Karacaoğlan, Dadaloğlu, Köroğlu, Âşık Veysel ve Pir Sultan Abdal bu gelenekten gelen şairlerdir. Âşık, şiirinin son dörtlüğünde kendi mahlasını söyler. Bu geleneğin kalıplaşmış şiir biçimleri koşma, semai, varsağı ve destandır. Koşma, âşık edebiyatının en yaygın şiir biçimidir; genellikle on bir hecelidir ve dörtlüklerden oluşur. Dadaloğlu'nun "Kalktı göç eyledi Avşar elleri" dizesiyle başlayan şiiri, göçebe yaşamın sona ermesine duyulan hüznü anlatan ünlü bir koşmadır.

Tekke edebiyatı ise dinî ve tasavvufi temaların işlendiği bir koldur. Bu edebiyatın şairleri tekkelerde yetişmiş mutasavvıflardır. Şiirlerinde insan sevgisi, Allah aşkı, hoşgörü ve olgunlaşma düşüncesi yer alır. Tekke edebiyatının en büyük temsilcisi on üçüncü yüzyılda yaşamış Yunus Emre'dir. Yunus Emre, sade bir Türkçeyle yazmış, halkın anlayacağı bir dille insan sevgisini öne çıkarmıştır. Şu dizeler, onun şiirinde sevginin ne kadar önemli olduğunu gösterir:

"Ben gelmedim dava için
Benim işim sevi içindir
Dostun evi gönüllerdir
Gönüller yapmaya geldim."

Bu dörtlükte şair, yaşamının amacının kavga etmek değil sevmek ve gönüller kazanmak olduğunu söyler. Yunus Emre'nin hece ölçüsüyle yazdığı ilahilerde sade bir dil ve içten bir anlatım hâkimdir. Tekke şiirinde ilahi, nefes, nutuk ve devriye gibi türler görülür. Âşık edebiyatında şiirin söylenişi ve saz önemlidir; tekke edebiyatında ise şiir daha çok ayinlerde ve sohbetlerde okunur.

Halk edebiyatı ürünlerinin ortak özellikleri vardır. Dil sade ve anlaşılırdır, söyleyişte günlük konuşma diline yakınlık görülür. Ölçü olarak genellikle hece ölçüsü kullanılır. Konular arasında aşk, ayrılık, doğa, kahramanlık ve toplumsal sorunlar bulunur. Şiirlerde yarım uyak ve cinaslı uyak sık görülür. Bu edebiyat kolları, Türk toplumunun duygu ve düşüncesini, yaşayış biçimini ve değerlerini sonraki kuşaklara aktarmıştır.`,
}

export const MATEMATIK_11: AuditSource = {
  folder: 'matematik-11',
  course: 'Matematik',
  grade: '11',
  outputLanguage: 'auto',
  text: `Trigonometride iki açının toplamının ve farkının trigonometrik oranları, tek tek açıların oranlarından hesaplanabilir. Toplam ve fark formülleri şunlardır: sin(a + b) = sin a · cos b + cos a · sin b, sin(a − b) = sin a · cos b − cos a · sin b, cos(a + b) = cos a · cos b − sin a · sin b ve cos(a − b) = cos a · cos b + sin a · sin b. Tanjant için tan(a + b) = (tan a + tan b) / (1 − tan a · tan b) bağıntısı kullanılır. Bu formüller sayesinde 15°, 75° ve 105° gibi özel olmayan açıların oranları 30°, 45° ve 60° açılarından bulunur.

Örnek olarak sin 75° değerini hesaplayalım. 75° = 45° + 30° olduğundan sin 75° = sin 45° · cos 30° + cos 45° · sin 30° olur. sin 45° = cos 45° = √2/2, cos 30° = √3/2 ve sin 30° = 1/2 olduğundan sin 75° = (√2/2)(√3/2) + (√2/2)(1/2) = (√6 + √2)/4 bulunur. Aynı yöntemle cos 15° = cos(45° − 30°) = cos 45° · cos 30° + sin 45° · sin 30° = (√6 + √2)/4 sonucuna ulaşılır. Bu iki değerin eşit olması, sin 75° = cos 15° olmasından beklenen bir sonuçtur, çünkü tümler açıların sinüs ve kosinüsleri eşittir.

Toplam formüllerinde a = b alınırsa iki kat açı formülleri elde edilir. sin 2a = 2 sin a cos a eşitliğidir. Kosinüs için cos 2a = cos² a − sin² a yazılır; sin² a + cos² a = 1 özdeşliği kullanılarak bu ifade cos 2a = 1 − 2 sin² a ya da cos 2a = 2 cos² a − 1 biçimlerine dönüştürülebilir. Tanjant için tan 2a = 2 tan a / (1 − tan² a) formülü geçerlidir. Örneğin sin a = 3/5 ve a dar açı ise cos a = 4/5 olduğundan sin 2a = 2 · (3/5) · (4/5) = 24/25 ve cos 2a = 16/25 − 9/25 = 7/25 bulunur.

Yarım açı formülleri iki kat açı formüllerinin yeniden düzenlenmesiyle elde edilir. cos 2a = 1 − 2 sin² a eşitliğinden sin² a = (1 − cos 2a)/2, cos 2a = 2 cos² a − 1 eşitliğinden ise cos² a = (1 + cos 2a)/2 yazılır. Bu formüller, kuvvetleri azaltmak ve integral gibi ileri konularda ifadeleri sadeleştirmek için kullanılır.

Trigonometrik denklemlerin çözümünde bu formüllerden yararlanılır. sin 2x = sin x denklemini ele alalım. sin 2x = 2 sin x cos x olduğundan 2 sin x cos x = sin x ve sin x (2 cos x − 1) = 0 bulunur. Buradan sin x = 0 ya da cos x = 1/2 olur. [0°, 360°) aralığında sin x = 0 için x = 0° ve x = 180°, cos x = 1/2 için ise x = 60° ve x = 300° değerleri elde edilir. Çözüm kümesi {0°, 60°, 180°, 300°} biçiminde yazılır. Denklemin iki tarafını sin x ile bölmek kök kaybına yol açar; bu nedenle ortak çarpan parantezine alınmalıdır.`,
}

export const FIZIK_10: AuditSource = {
  folder: 'fizik-10',
  course: 'Fizik',
  grade: '10',
  outputLanguage: 'auto',
  text: `Basınç, birim yüzeye dik olarak etki eden kuvvettir. Bir yüzeye dik uygulanan kuvvet F, yüzeyin alanı A ise basınç P = F / A formülüyle bulunur. Kuvvetin birimi newton (N), alanın birimi metrekare (m²) olduğundan basıncın SI birimi paskal (Pa) olur; 1 Pa = 1 N/m² değerindedir. Aynı kuvvet küçük bir yüzeye uygulandığında basınç büyür. Bu nedenle çivinin ucu sivri yapılır ve bıçaklar keskin tutulur. Kar ayakkabıları geniş yapıldığı için kuvvetin yüzeye yayılmasını sağlar ve ağırlığı dağıtır.

Katı cisimler ağırlıklarını dayandıkları yüzeye iletirler. Ağırlığı 600 N olan bir kişi tabanının alanı toplam 0,03 m² olan ayakkabılarla duruyorsa yere uyguladığı basınç P = 600 / 0,03 = 20 000 Pa olur. Kişi tek ayağı üstünde dururken alan yarıya indiği için basınç iki katına çıkar ve 40 000 Pa olur.

Sıvılar, bulundukları kabın tabanına ve çeperlerine basınç uygular. Durgun bir sıvının içindeki basınç derinlikle artar. Sıvı basıncı P = h · d · g formülüyle hesaplanır. Burada h sıvının yüzeyinden olan derinlik (m), d sıvının yoğunluğu (kg/m³) ve g yerçekimi ivmesidir. g yaklaşık 10 m/s² alınır. Örneğin yoğunluğu 1000 kg/m³ olan suyun 5 m derinliğindeki sıvı basıncı P = 5 · 1000 · 10 = 50 000 Pa'dır. Sıvı basıncı kabın şekline ve içindeki sıvı miktarına bağlı değildir; yalnızca derinliğe, yoğunluğa ve g'ye bağlıdır. Aynı derinlikteki bütün noktalarda sıvı basıncı eşittir. Barajların duvarları aşağı doğru kalınlaştırılarak yapılır, çünkü derinlik arttıkça basınç büyür.

Açık hava basıncı, atmosferin ağırlığından doğan basınçtır. Deniz seviyesinde açık hava basıncı yaklaşık 100 000 Pa (1 atmosfer) değerindedir. Yükseklere çıkıldıkça hava inceldiği için açık hava basıncı azalır. İtalyan bilim insanı Torricelli, cıva dolu bir cam borunun yardımıyla açık hava basıncını ölçmüştür; deniz seviyesinde cıva sütunu 76 cm yükseklikte durur.

Bir sıvıya batırılan cisme sıvı tarafından yukarı doğru uygulanan kuvvete kaldırma kuvveti denir. Kaldırma kuvveti F_k = V · d · g formülüyle bulunur. Burada V cismin sıvıya batan hacmi (m³), d sıvının yoğunluğudur. Hacmi 0,002 m³ olan bir cisim tamamen suya batırılırsa kaldırma kuvveti F_k = 0,002 · 1000 · 10 = 20 N olur. Bir cismin ağırlığı kaldırma kuvvetinden büyükse cisim batar, küçükse yüzer, eşitse sıvının içinde dengede kalır. Gemiler, çelikten yapılmış olmalarına rağmen suyun yer değiştirmesi sayesinde yüzer; çünkü geminin batan kısmının hacmi büyüktür ve kaldırma kuvveti ağırlığına eşit olur.`,
}

export const KIMYA_11: AuditSource = {
  folder: 'kimya-11',
  course: 'Kimya',
  grade: '11',
  outputLanguage: 'auto',
  text: `Birçok kimyasal tepkime tek yönlü değildir; ürünler yeniden girenlere dönüşebilir. Hem ileri hem geri yönde yürüyebilen tepkimelere tersinir tepkimeler denir. Tersinir bir tepkimede ileri ve geri tepkimelerin hızları eşitlendiğinde denge kurulur. Denge anında girenlerin ve ürünlerin derişimleri sabit kalır, ancak tepkime durmuş değildir; ileri ve geri tepkimeler aynı hızla sürer. Bu nedenle denge dinamik bir dengedir. Tepkime denklemlerinde tersinirlik çift yönlü ok ile gösterilir.

Haber–Bosch yöntemiyle amonyak üretimi buna örnektir: N₂(g) + 3H₂(g) ⇌ 2NH₃(g). Bu tepkime ekzotermiktir, yani ısı açığa çıkarır. Dengedeki bir tepkime için derişimler cinsinden denge sabiti Kc ifadesi yazılır. Genel bir tepkime aA + bB ⇌ cC + dD için Kc = [C]^c · [D]^d / ([A]^a · [B]^b] olur. Katı ve saf sıvıların derişimi sabit kabul edildiğinden denge sabiti ifadesinde yer almaz. Amonyak tepkimesi için Kc = [NH₃]² / ([N₂] · [H₂]³) biçimindedir. Kc değeri sıcaklığa bağlıdır; derişim ve basınç değişimleri Kc'yi değiştirmez. Kc değeri büyükse dengede ürünler çoktur, küçükse girenler çoktur.

Dengeye etki eden değişimleri Le Chatelier ilkesi açıklar. Bu ilkeye göre dengede olan bir sisteme dışarıdan bir etki uygulanırsa sistem bu etkiyi azaltacak yönde tepki verir. Girenlerden birinin derişimi artırılırsa denge ürünler yönüne, bir ürünün derişimi artırılırsa girenler yönüne kayar. Gazlı tepkimelerde sıcaklık sabitken basınç artırılırsa denge gaz mol sayısının az olduğu tarafa kayar. Amonyak tepkimesinde girenler tarafında 4 mol, ürünler tarafında 2 mol gaz vardır; bu yüzden basıncı artırmak dengeyi ürünler yönüne, yani amonyak oluşumuna kaydırır. Sıcaklık artırılırsa denge endotermik yöne kayar. Ekzotermik amonyak tepkimesinde sıcaklığın artması dengeyi girenler yönüne kaydırır. Katalizör ise ileri ve geri tepkimelerin hızını eşit oranda artırır; dengeye daha çabuk ulaşılmasını sağlar fakat denge konumunu ve Kc değerini değiştirmez.

Sulu çözeltilerde de denge görülür. Zayıf bir asit olan asetik asit suda kısmen iyonlaşır: CH₃COOH(suda) ⇌ CH₃COO⁻(suda) + H⁺(suda). Çözeltiye asetat iyonu içeren bir tuz eklenirse denge girenler yönüne kayar; buna ortak iyon etkisi denir. Suyun kendi iyonlaşması da bir dengedir: H₂O(s) ⇌ H⁺(suda) + OH⁻(suda). 25 °C'de suyun iyonlar çarpımı Ksu = [H⁺][OH⁻] = 1,0 · 10⁻¹⁴ değerindedir. Saf suda [H⁺] = [OH⁻] = 1,0 · 10⁻⁷ mol/L olduğundan pH = 7'dir. Asidik çözeltilerde [H⁺] > 10⁻⁷ mol/L ve pH < 7, bazik çözeltilerde ise [H⁺] < 10⁻⁷ mol/L ve pH > 7 olur.`,
}

export const BIYOLOJI_9: AuditSource = {
  folder: 'biyoloji-9',
  course: 'Biyoloji',
  grade: '9',
  outputLanguage: 'auto',
  text: `Hücre, canlıların yapı ve görev bakımından en küçük birimidir. Hücreyi ilk kez 1665 yılında İngiliz bilim insanı Robert Hooke, kendi yaptığı mikroskopla bir mantar parçasını inceleyerek gözlemlemiştir. Hooke, mantarda gördüğü küçük odacıklara hücre adını vermiştir. Daha sonra Anton van Leeuwenhoek, mikroskoplarını geliştirerek tek hücreli canlıları ve kan hücrelerini gözlemlemiştir. Hücre teorisi, Schleiden, Schwann ve Virchow'un çalışmalarıyla ortaya konmuştur. Bu teoriye göre bütün canlılar bir ya da daha fazla hücreden oluşur, hücre canlılığın temel birimidir ve her hücre kendinden önceki bir hücreden meydana gelir.

Hücreler, çekirdek zarına sahip olup olmamalarına göre ikiye ayrılır. Prokaryot hücrelerde çekirdek zarı yoktur ve kalıtım maddesi sitoplazmada serbest hâlde bulunur. Bakteriler prokaryot hücreli canlılara örnektir. Ökaryot hücrelerde ise çekirdek zarı vardır ve zarla çevrili organeller bulunur. Hayvanlar, bitkiler, mantarlar ve protistler ökaryot hücrelidir.

Hücre zarı, hücreyi dış ortamdan ayıran canlı bir yapıdır. Hücre zarı fosfolipit ve protein moleküllerinden oluşur ve seçici geçirgendir; yani bazı maddelerin geçişine izin verir, bazılarını engeller. Bitki hücrelerinde zarın dışında selülozdan yapılmış, hücreye şekil ve koruma sağlayan hücre duvarı bulunur. Hayvan hücrelerinde hücre duvarı yoktur.

Çekirdek, hücrenin yönetim merkezidir ve kalıtım maddesi DNA'yı taşır. Ribozomlar protein sentezinin yapıldığı küçük organellerdir ve zarsızdır. Mitokondri, hücresel solunum yapan ve ATP üreten organeldir; bu yüzden hücrenin enerji santrali olarak adlandırılır. Kloroplast yalnızca bitki hücrelerinde bulunur ve fotosentezin yapıldığı organeldir; içerdiği klorofil pigmenti ışığı soğurur. Golgi aygıtı, hücrede üretilen maddeleri paketleyerek hücre dışına gönderir. Lizozom, hücre içi sindirimi yapan enzimleri taşır. Koful, bitki hücrelerinde büyük bir boşluk hâlindedir ve su ile çeşitli maddeleri depolar. Endoplazmik retikulum, hücre içinde madde taşınmasını sağlayan kanallar ağıdır; üzerinde ribozom bulunan türüne granüllü endoplazmik retikulum denir.

Hücrelerde maddelerin zardan geçişi farklı yollarla olur. Difüzyon, maddelerin derişimin çok olduğu ortamdan az olduğu ortama enerji harcamadan geçişidir. Ozmos ise suyun yarı geçirgen bir zardan geçişidir. Aktif taşımada madde derişimin az olduğu yerden çok olduğu yere ATP harcanarak taşınır. Büyük moleküller zarın oluşturduğu keseciklerle alınır ya da dışarı atılır; buna endositoz ve ekzositoz denir.`,
}

export const TARIH_10: AuditSource = {
  folder: 'tarih-10',
  course: 'Tarih',
  grade: '10',
  outputLanguage: 'auto',
  text: `Kanuni Sultan Süleyman, 1520 yılında Osmanlı tahtına çıktı ve 1566 yılına kadar kırk altı yıl hüküm sürdü. Onun dönemi, Osmanlı Devleti'nin siyasi, askerî ve kültürel yönden en parlak yıllarıdır. Kanuni, tahta çıktıktan kısa süre sonra Orta Avrupa'daki Belgrad'ın alınmasını hedefledi. Belgrad, 1521 yılında fethedildi ve Osmanlı'nın Macaristan'a açılan kapısı oldu. Ertesi yıl, 1522'de Rodos Adası alındı. Rodos'un fethi Doğu Akdeniz'deki deniz ticaretinin güvenliğini artırdı.

Kanuni'nin Macar seferi, Osmanlı'nın Avrupa'daki gücünü gösterdi. 29 Ağustos 1526'da yapılan Mohaç Meydan Muharebesi'nde Macar ordusu yenildi ve Macar Kralı II. Lajos öldü. Bu zaferle Macaristan'ın büyük bölümü Osmanlı'nın etki alanına girdi. Kanuni 1529 yılında Viyana'yı kuşattı; ancak kış şartları ve ikmal güçlükleri yüzünden kuşatma sonuçsuz kaldı. Osmanlı ile Avusturya arasındaki mücadele sonraki yıllarda da sürdü.

Doğuda Kanuni, İran'a karşı üç sefer düzenledi. Bu seferlerle Irak ve Bağdat Osmanlı'ya katıldı. Güneyde Mısır Osmanlı topraklarındaydı ve Kızıldeniz ile Hint Okyanusu'ndaki Portekiz faaliyetlerine karşı donanma hazırlıkları yapıldı. Bu dönemde Barbaros Hayreddin Paşa, Osmanlı donanmasının başına getirildi. Barbaros, 1538 yılında Preveze Deniz Savaşı'nda Haçlı donanmasını yendi. Bu zaferle Osmanlı Akdeniz'de üstünlük kazandı ve bu üstünlük yaklaşık otuz üç yıl sürdü.

Kanuni, yönetimde adalete önem verdi. Hukuk alanındaki düzenlemeleri nedeniyle batıda "Muhteşem", Osmanlı'da ise "Kanuni" unvanıyla anıldı. Kanunname adı verilen düzenlemelerle toprak sistemini, vergileri ve suçlara verilecek cezaları belirledi. Osmanlı hukukunda kadılar adaleti uygulardı. Kanuni döneminde sanat ve mimari de gelişti. Mimar Sinan, başmimar olarak Şehzadebaşı Camii'ni, Süleymaniye Camii'ni ve Selimiye Camii'ni yaptı. Süleymaniye Camii 1557 yılında tamamlandı. Edebiyat alanında Fuzuli ve Bâkî gibi şairler yetişti; Bâkî'ye "sultanüşşuara", yani şairler sultanı unvanı verilmiştir.

Kanuni 1566 yılında Zigetvar Seferi sırasında hayatını kaybetti. Ölümünden sonra yerine oğlu II. Selim geçti. Kanuni dönemi sonrasında Osmanlı'nın sınırları genişliğini korudu, ancak merkezî yönetimde, ekonomide ve orduda sorunlar belirmeye başladı. Bu yüzden tarihçiler Kanuni'nin ölümünü yükselme döneminin sonu ve duraklama döneminin başlangıcı olarak yorumlar. Yine de onun saltanatı, Osmanlı'nın üç kıtaya yayılan bir imparatorluk olduğu dönem olarak hatırlanır.`,
}

export const COGRAFYA_9: AuditSource = {
  folder: 'cografya-9',
  course: 'Coğrafya',
  grade: '9',
  outputLanguage: 'auto',
  text: `Dünya, Güneş etrafında dönen ve kendi ekseni çevresinde de hareket eden bir gezegendir. Dünya'nın iki temel hareketi vardır: günlük hareket ve yıllık hareket. Günlük hareket, Dünya'nın kendi ekseni etrafında batıdan doğuya doğru dönmesidir. Bu dönüş yaklaşık 24 saatte tamamlanır. Dünya'nın kendi ekseni çevresindeki dönüşünün sonuçları arasında gece ile gündüzün oluşması, Güneş'in doğudan doğup batıdan batıyormuş gibi görünmesi ve yerel saat farkları vardır. Dünya kendi etrafında dönerken her gün 360 derece dönmüş olur ve her 15 derecelik boylam farkı için yerel saat bir saat değişir. Doğuya doğru gidildikçe saat ileri, batıya doğru gidildikçe geri alınır. Dünya'nın günlük hareketinin bir başka sonucu, hareket hâlindeki cisimlerin sapmasıdır; kuzey yarım kürede cisimler sağa, güney yarım kürede sola sapar.

Yıllık hareket, Dünya'nın Güneş çevresinde elips şeklindeki yörüngesinde dolanmasıdır. Bu dolanma yaklaşık 365 gün 6 saat sürer. Dört yılda bir biriken fazladan saatler Şubat ayına bir gün ekleyerek 366 günlük artık yıl oluşturur. Dünya'nın ekseni yörünge düzlemine dik değildir; yaklaşık 23° 27′ eğiktir. Eksen eğikliği ile yıllık hareket birleşince mevsimler oluşur. Güneş ışınları yılın farklı zamanlarında Dünya'ya farklı açılarla gelir.

Güneş ışınlarının Dünya'ya dik geldiği yer, yıl içinde Ekvator ile Oğlak Dönencesi, Yengeç Dönencesi arasında yer değiştirir. 21 Haziran'da ışınlar Yengeç Dönencesi'ne dik gelir ve Kuzey Yarım Küre'de yaz başlar. Bu tarihte kuzey yarım kürede en uzun gündüz yaşanır. 22 Aralık'ta ışınlar Oğlak Dönencesi'ne dik gelir; Kuzey Yarım Küre'de kış başlar ve en uzun gece yaşanır. 21 Mart ve 23 Eylül tarihlerinde ışınlar Ekvator'a dik gelir. Bu tarihlerde gece ile gündüz süreleri eşittir; bu olaya ekinoks denir. Mart ekinoksu Kuzey Yarım Küre'de ilkbaharın, eylül ekinoksu ise sonbaharın başlangıcıdır.

Dünya'nın hareketleri nedeniyle Güneş ışınlarının geliş açısı ve gün uzunluğu değişir; bu da sıcaklık farklarına neden olur. Ekvator çevresinde ışınlar yıl boyunca dike yakın geldiği için sıcaklık yüksektir, kutuplarda ise ışınlar çok eğik geldiği için sıcaklık düşüktür. Bu nedenle sıcak, ılıman ve soğuk kuşaklar ortaya çıkar. Sıcak kuşak iki dönence arasında, ılıman kuşaklar dönenceler ile kutup daireleri arasında, soğuk kuşaklar ise kutup daireleri ile kutuplar arasında yer alır. Kutup bölgelerinde yılın bir bölümü boyunca Güneş hiç batmaz ya da hiç doğmaz.

Türkiye, 36° - 42° kuzey enlemleri ile 26° - 45° doğu boylamları arasında yer alır. Bu konum nedeniyle ılıman kuşakta bulunur ve dört mevsim belirgin biçimde yaşanır. Ülkenin doğusu ile batısı arasındaki boylam farkı yaklaşık 19 derecedir, bu yüzden Doğu Anadolu'da Güneş batıya göre yaklaşık 76 dakika önce doğar.`,
}

export const FELSEFE_10: AuditSource = {
  folder: 'felsefe-10',
  course: 'Felsefe',
  grade: '10',
  outputLanguage: 'auto',
  text: `Bilgi felsefesi, bilginin doğasını, kaynağını, sınırlarını ve doğruluğunu inceleyen felsefe dalıdır. Bu alana epistemoloji de denir. Bilgi felsefesinin temel soruları şunlardır: Bilgi nedir? İnsan bilebilir mi? Bilginin kaynağı nedir? Doğru bilgiye nasıl ulaşılır? Bu sorulara verilen yanıtlar farklı görüşleri doğurmuştur.

Bilginin mümkün olup olmadığı konusunda üç temel tutum vardır. Dogmatizm, insanın gerçek bilgiye ulaşabileceğini, bilginin mümkün olduğunu savunur. Dogmatik filozoflar, bilginin kaynağını sorgulamadan doğru kabul ederler. Septisizm, yani kuşkuculuk, kesin ve evrensel bilgiye ulaşılamayacağını ileri sürer. Septiklere göre duyularımız bizi yanıltabilir ve akıl yürütmelerimiz kesin sonuç vermez. Kuşkuculuğun bir türü olan mutlak kuşkuculuk bilginin hiçbir şekilde mümkün olmadığını söylerken, ılımlı kuşkuculuk bilgiden kuşku duymayı yöntem olarak benimser. Kritisizm, yani eleştiricilik ise bilginin mümkün olduğunu kabul eder, ancak bilginin sınırlarını incelemek gerektiğini savunur. Eleştiricilik, Immanuel Kant'ın felsefesiyle ilişkilendirilir.

Bilginin kaynağı konusunda da farklı görüşler vardır. Rasyonalizm, yani akılcılık, gerçek bilginin kaynağının akıl olduğunu söyler. Akılcılara göre duyular yanıltıcıdır; doğru bilgi, akıl yürütme ve doğuştan gelen düşüncelerle elde edilir. René Descartes ve Baruch Spinoza akılcı filozoflardır. Empirizm, yani deneycilik, bilginin kaynağının deney ve gözlem olduğunu savunur. Deneyciler, insan zihninin doğuştan boş bir levha olduğunu ve bütün bilginin deneyimle kazanıldığını söylerler. John Locke ve David Hume deneyciliğin ünlü temsilcileridir. Sensualizm, bilginin kaynağını duyular olarak görür. Entüisyonizm ise sezgiyi ve içgörüyü bilginin yolu sayar.

Doğru bilgiden söz edebilmek için bilginin doğruluğunu belirleyecek ölçütlere ihtiyaç vardır. Doğruluk kuramlarına göre bir önerme, gerçekliğe uyuyorsa doğrudur. Buna uygunluk kuramı denir. Tutarlılık kuramı, bir önermenin diğer önermelerle çelişmiyorsa doğru olduğunu söyler. Pragmatist kuram ise doğruluğu yararlı sonuçlar vermesine bağlar. Her kuram bilgi hakkında farklı bir bakış açısı sunar ve hiçbiri tartışmadan bağımsız değildir.

Bilgi türleri de farklıdır. Gündelik bilgi, günlük yaşam içinde edinilen ve sistemli olmayan bilgidir. Bilimsel bilgi ise gözlem, deney ve akıl yürütmeyle elde edilen, sınanabilir ve sistemli bilgidir. Felsefi bilgi, varlığın ve bilginin temel sorularını sorgular. Din bilgisi ise inanca dayanır. Bu bilgi türlerinin kaynakları ve sınanma yolları birbirinden ayrılır.`,
}

export const DIN_9: AuditSource = {
  folder: 'din-9',
  course: 'Din Kültürü ve Ahlak Bilgisi',
  grade: '9',
  outputLanguage: 'auto',
  text: `İslam dininde ibadet, Müslümanın Allah'a olan kulluk bilincini davranışlarıyla göstermesidir. İbadetler, bireyin Allah ile ilişkisini düzenler ve toplum hayatında düzen ile dayanışmayı güçlendirir. İslam'ın beş temel ibadeti vardır: kelime-i şehadet, namaz, oruç, zekât ve hac. Bu beş şarta İslam'ın şartları denir.

Namaz, günde beş vakit kılınan ibadettir. Bu vakitler sabah, öğle, ikindi, akşam ve yatsıdır. Namaz kılmadan önce abdest alınması gerekir. Abdest, yüzün, kolların ve ayakların yıkanması, başın mesh edilmesiyle yapılır. Namaz, belirli bir sıra ile kıyam, rükû ve secde hareketlerinden oluşur. Cuma günü öğle vaktinde cemaatle cuma namazı kılınır. Bayram namazları da yılda iki kez, Ramazan Bayramı ve Kurban Bayramı'nda kılınır. Namaz kılmak insanı kötülüklerden uzak tutar ve disiplin kazandırır.

Oruç, Ramazan ayında fecirden akşama kadar yeme, içme ve oruç bozan diğer davranışlardan uzak durmaktır. Ramazan, hicri takvimin dokuzuncu ayıdır. Oruç tutmak insana sabır ve irade eğitimi kazandırır. Hasta ve yolcu olanlar oruç tutmayabilir, daha sonra tutamadıkları günleri kazaya bırakabilir. Oruç ibadetinin sonunda Ramazan Bayramı kutlanır ve fitre verilir. Fitre, Ramazan Bayramı'ndan önce verilen bir sadakadır.

Zekât, belirli bir miktar maldan, yani nisap miktarındaki maldan, bir yıl geçtikten sonra yoksullara verilen paradır. Zekât, mal varlığının yaklaşık yüzde iki buçuğu kadardır ve toplumdaki yardımlaşmayı artırır. Zekât alabilecek kişiler arasında fakirler, yoksullar ve borçlular yer alır. Zekât, zenginlerin malından yoksulların hakkını vermesidir. Böylece toplumda gelir dengesizliği azaltılır ve kardeşlik duygusu güçlenir.

Hac, maddi ve bedensel gücü yeten Müslümanların ömürlerinde bir kez Mekke'deki Kâbe'yi ziyaret etmeleri ve belirli ibadetleri yerine getirmeleridir. Hac, Zilhicce ayında yapılır. Hac ibadetinin temel bölümleri ihram giymek, Arafat'ta vakfe yapmak ve Kâbe'yi tavaf etmektir. Dünyanın dört bir yanından gelen Müslümanlar aynı elbiseyi giyerek eşitlik ve kardeşliği yaşar. Hac ibadeti sırasında Kurban Bayramı da kutlanır.

İslam'da ibadetler yalnızca kişisel bir davranış değildir; ahlaki bir eğitim sürecidir. İbadet, kişinin dürüstlük, merhamet, sabır ve paylaşma gibi değerleri benimsemesine yardımcı olur. Din Kültürü ve Ahlak Bilgisi dersinde ibadetler, farklı dinlere ve inançlara saygı çerçevesinde tarafsız biçimde ele alınır.`,
}

export const ECONOMICS_UNI: AuditSource = {
  folder: 'universite-economics',
  course: 'Economics',
  grade: 'Üniversite',
  outputLanguage: 'en',
  text: `Microeconomics studies how individual consumers and firms make decisions and how their choices interact in markets. Its central tool is the model of supply and demand. The law of demand states that, other things being equal, when the price of a good rises, the quantity demanded falls. The demand curve therefore slopes downward. The law of supply states that when the price rises, producers are willing to supply more, so the supply curve slopes upward. The market equilibrium occurs where the two curves intersect. At the equilibrium price, the quantity that consumers want to buy equals the quantity that producers want to sell, and the market clears.

A shift of a curve is different from a movement along it. A change in the price of the good itself moves us along the curve. A change in other factors shifts the whole curve. Demand shifts when consumer income changes, when tastes change, when the prices of related goods change, or when the number of buyers changes. A rise in income increases the demand for normal goods, but decreases the demand for inferior goods. Substitutes are goods that can replace each other, such as tea and coffee; complements are goods consumed together, such as cars and fuel. Supply shifts when input costs, technology or the number of sellers change. An improvement in technology lowers costs and shifts the supply curve to the right.

Elasticity measures how responsive quantity is to a change in price or income. The price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price. If the absolute value is greater than one, demand is elastic; if it is less than one, demand is inelastic; if it equals one, demand is unit elastic. Goods with close substitutes, such as a particular brand of soft drink, tend to have elastic demand. Necessities with few substitutes, such as insulin, tend to have inelastic demand. When demand is inelastic, a price increase raises total revenue; when demand is elastic, a price increase lowers total revenue. The income elasticity of demand is positive for normal goods and negative for inferior goods.

Government intervention can change market outcomes. A price ceiling is a legal maximum price. If it is set below the equilibrium price, it creates a shortage, because the quantity demanded exceeds the quantity supplied. Rent control is a common example. A price floor is a legal minimum price. If it is set above the equilibrium price, it creates a surplus; the minimum wage is often discussed as a price floor in the labour market. Taxes also change behaviour. A tax on a good raises the price paid by buyers and lowers the price received by sellers, and the burden is shared according to the relative elasticities of supply and demand. The side that is less elastic bears a larger share of the tax.

Economists also study market failures. An externality is a cost or benefit that affects people who are not part of a transaction. Pollution is a negative externality, because the producer does not pay for the damage. Vaccination is a positive externality, because other people benefit from reduced disease. When externalities exist, the market quantity differs from the socially efficient quantity, and policies such as taxes or subsidies can improve efficiency.`,
}

/** The 600-word source of the V5 variety measurement (three exams from one text). */
export const BIYOLOJI_600: AuditSource = {
  folder: 'v5-biyoloji-600',
  course: 'Biyoloji',
  grade: '10',
  outputLanguage: 'auto',
  text: `Fotosentez, bitkilerin, alglerin ve bazı bakterilerin ışık enerjisini kimyasal enerjiye çevirdiği süreçtir. Bitkilerde fotosentez yapraklardaki kloroplastlarda gerçekleşir. Kloroplastın içinde tilakoit adı verilen yassı zar keseleri bulunur; tilakoitlerin üst üste dizilmiş gruplarına grana, onları çevreleyen sıvıya ise stroma denir. Işığı soğuran ana pigment klorofildir ve yapraklara yeşil rengini verir. Klorofil, mavi ve kırmızı ışığı en iyi soğurur, yeşil ışığı ise büyük ölçüde yansıtır. Bu yüzden yapraklar yeşil görünür.

Fotosentez iki evrede gerçekleşir. Işığa bağımlı evre tilakoit zarlarında yapılır. Bu evrede ışık enerjisiyle su molekülleri parçalanır, oksijen gazı açığa çıkar ve enerji taşıyıcı moleküller olan ATP ile NADPH üretilir. Işıktan bağımsız evre olan Calvin döngüsü ise stromada gerçekleşir. Calvin döngüsünde havadaki karbondioksit, ATP ve NADPH'nin enerjisiyle glikoza dönüştürülür. Bu evre doğrudan ışık gerektirmez, fakat ışığa bağımlı evrede üretilen moleküllere ihtiyaç duyar. Fotosentezin genel denklemi karbondioksit ile suyun ışık varlığında glikoz ve oksijene dönüşmesi şeklinde özetlenir.

Fotosentezin hızını ışık şiddeti, sıcaklık ve karbondioksit derişimi etkiler. Işık şiddeti belirli bir noktaya kadar artırıldığında fotosentez hızı artar, sonra sabit kalır. Sıcaklık, enzimlerin çalışmasını etkilediği için çok yüksek değerlerde fotosentez hızı düşer. Karbondioksit derişimi de belirli bir sınıra kadar hızı artırır. Bu faktörlerden hangisi en az düzeydeyse fotosentez hızını o sınırlar; buna sınırlayıcı faktör denir.

Hücresel solunum, canlıların besinlerdeki enerjiyi ATP'ye çevirdiği süreçtir. Fotosentezin tersine, solunum sırasında glikoz oksijenle yıkılır, karbondioksit ve su açığa çıkar. Hücresel solunum üç basamakta gerçekleşir. Glikoliz sitoplazmada olur ve bir glikoz iki pirüvik asite parçalanır; bu basamakta oksijen gerekmez. Krebs döngüsü mitokondrinin matriksinde yapılır. Elektron taşıma sistemi ise mitokondrinin iç zarında gerçekleşir ve en fazla ATP bu basamakta üretilir. Bir glikozun oksijenli solunumla tam yıkımında toplam yaklaşık otuz sekiz ATP elde edilir; glikolizde ise yalnızca iki ATP kazanılır.

Oksijen bulunmayan ortamlarda bazı canlılar fermantasyon yapar. Fermantasyonda glikoz tam yıkılmaz ve çok daha az ATP elde edilir. Alkol fermantasyonu mayalarda görülür; bu süreçte glikozdan etil alkol ve karbondioksit oluşur. Ekmeğin kabarması karbondioksit sayesinde olur. Laktik asit fermantasyonu ise bazı bakterilerde ve yoğun egzersiz yapan kas hücrelerinde görülür; bu süreçte glikozdan laktik asit oluşur. Yoğurdun ve turşunun yapımında laktik asit bakterileri kullanılır.

Fotosentez ve solunum birbirini tamamlayan olaylardır. Fotosentezin ürünleri olan glikoz ve oksijen, solunumun girenleri olarak kullanılır; solunumun ürünleri olan karbondioksit ve su ise fotosentezin hammaddeleridir. Bu sayede madde döngüsü sürekli devam eder. Fotosentez yapan canlılara ototrof, besini hazır alan canlılara ise heterotrof denir. Ototroflar besin zincirinin ilk halkasını oluşturur ve ekosistemdeki enerjinin kaynağı olan Güneş enerjisini kimyasal enerjiye çevirirler. Karasal ekosistemlerde bitkiler, okyanus ekosistemlerinde ise algler ve bazı bakteriler bu görevi yapar. Yeryüzündeki oksijenin önemli bir bölümü okyanuslardaki planktonların fotosentezi sonucunda oluşur. Yağmur ormanları ise büyük miktarda karbondioksit tutan ve oksijen üreten bölgelerdir.`,
}

/** 150 words: too short for 20 questions. */
export const SHORT_150: AuditSource = {
  folder: 'kisa-150',
  course: 'Biyoloji',
  grade: '9',
  outputLanguage: 'auto',
  text: `Hücre, canlıların yapı ve görev bakımından en küçük birimidir. Hücreyi ilk kez 1665 yılında Robert Hooke bir mantar parçasında gözlemlemiştir. Prokaryot hücrelerde çekirdek zarı yoktur; bakteriler prokaryottur. Ökaryot hücrelerde çekirdek zarı ve zarlı organeller bulunur. Hücre zarı fosfolipit ve proteinlerden oluşur ve seçici geçirgendir. Mitokondri hücresel solunum yapar ve ATP üretir. Kloroplast yalnızca bitki hücrelerinde bulunur ve fotosentezin yapıldığı organeldir. Ribozomlar protein sentezinin yapıldığı küçük organellerdir. Golgi aygıtı hücrede üretilen maddeleri paketler. Lizozom hücre içi sindirimi sağlar. Koful bitki hücrelerinde su depolar. Bitki hücrelerinde hücre zarının dışında selülozdan yapılmış hücre duvarı vardır; hayvan hücrelerinde hücre duvarı bulunmaz. Çekirdek hücrenin yönetim merkezidir ve kalıtım maddesi DNA'yı taşır.`,
}
