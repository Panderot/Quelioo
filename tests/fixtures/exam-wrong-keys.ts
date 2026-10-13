import type { ExamQuestion } from '../../src/lib/exam/types'

/** The three wrong answer keys the real-AI audit of 13 Oct 2026 found (answer-key-audit.md), each with the source text it was written from. */

export interface WrongKeyCase {
  source: string
  question: ExamQuestion
  /** What a correct key reads like. */
  truth: string
}

/** Kimya 11 S19: [H+] = 2,0e-6 is acid, so the key "bazik" (option C) is wrong; the right option is D. */
export const KIMYA_MCQ: WrongKeyCase = {
  source: "Birçok kimyasal tepkime tek yönlü değildir; ürünler yeniden girenlere dönüşebilir. Hem ileri hem geri yönde yürüyebilen tepkimelere tersinir tepkimeler denir. Tersinir bir tepkimede ileri ve geri tepkimelerin hızları eşitlendiğinde denge kurulur. Denge anında girenlerin ve ürünlerin derişimleri sabit kalır, ancak tepkime durmuş değildir; ileri ve geri tepkimeler aynı hızla sürer. Bu nedenle denge dinamik bir dengedir. Tepkime denklemlerinde tersinirlik çift yönlü ok ile gösterilir.\n\nHaber–Bosch yöntemiyle amonyak üretimi buna örnektir: N₂(g) + 3H₂(g) ⇌ 2NH₃(g). Bu tepkime ekzotermiktir, yani ısı açığa çıkarır. Dengedeki bir tepkime için derişimler cinsinden denge sabiti Kc ifadesi yazılır. Genel bir tepkime aA + bB ⇌ cC + dD için Kc = [C]^c · [D]^d / ([A]^a · [B]^b] olur. Katı ve saf sıvıların derişimi sabit kabul edildiğinden denge sabiti ifadesinde yer almaz. Amonyak tepkimesi için Kc = [NH₃]² / ([N₂] · [H₂]³) biçimindedir. Kc değeri sıcaklığa bağlıdır; derişim ve basınç değişimleri Kc'yi değiştirmez. Kc değeri büyükse dengede ürünler çoktur, küçükse girenler çoktur.\n\nDengeye etki eden değişimleri Le Chatelier ilkesi açıklar. Bu ilkeye göre dengede olan bir sisteme dışarıdan bir etki uygulanırsa sistem bu etkiyi azaltacak yönde tepki verir. Girenlerden birinin derişimi artırılırsa denge ürünler yönüne, bir ürünün derişimi artırılırsa girenler yönüne kayar. Gazlı tepkimelerde sıcaklık sabitken basınç artırılırsa denge gaz mol sayısının az olduğu tarafa kayar. Amonyak tepkimesinde girenler tarafında 4 mol, ürünler tarafında 2 mol gaz vardır; bu yüzden basıncı artırmak dengeyi ürünler yönüne, yani amonyak oluşumuna kaydırır. Sıcaklık artırılırsa denge endotermik yöne kayar. Ekzotermik amonyak tepkimesinde sıcaklığın artması dengeyi girenler yönüne kaydırır. Katalizör ise ileri ve geri tepkimelerin hızını eşit oranda artırır; dengeye daha çabuk ulaşılmasını sağlar fakat denge konumunu ve Kc değerini değiştirmez.\n\nSulu çözeltilerde de denge görülür. Zayıf bir asit olan asetik asit suda kısmen iyonlaşır: CH₃COOH(suda) ⇌ CH₃COO⁻(suda) + H⁺(suda). Çözeltiye asetat iyonu içeren bir tuz eklenirse denge girenler yönüne kayar; buna ortak iyon etkisi denir. Suyun kendi iyonlaşması da bir dengedir: H₂O(s) ⇌ H⁺(suda) + OH⁻(suda). 25 °C'de suyun iyonlar çarpımı Ksu = [H⁺][OH⁻] = 1,0 · 10⁻¹⁴ değerindedir. Saf suda [H⁺] = [OH⁻] = 1,0 · 10⁻⁷ mol/L olduğundan pH = 7'dir. Asidik çözeltilerde [H⁺] > 10⁻⁷ mol/L ve pH < 7, bazik çözeltilerde ise [H⁺] < 10⁻⁷ mol/L ve pH > 7 olur.\n\nAz çözünen tuzların çözeltilerinde de denge kurulur. Gümüş klorürün sudaki dengesi AgCl(k) ⇌ Ag⁺(suda) + Cl⁻(suda) biçiminde yazılır. Katı AgCl'nin derişimi sabit olduğundan çözünürlük çarpımı Kçç = [Ag⁺][Cl⁻] ifadesiyle verilir. Çözünürlük çarpımı yalnızca sıcaklığa bağlıdır. Çözeltideki iyon derişimleri çarpımı Kçç değerini aşarsa çökelme gerçekleşir, aşmazsa tuz çözünmeye devam eder. Ortak iyon bulunması, örneğin NaCl çözeltisine AgCl eklenmesi, AgCl'nin çözünürlüğünü azaltır.",
  question: {
  "id": "qqjsgcevzwys9",
  "type": "mcq",
  "stem": "25 °C'de bir sulu çözeltide $[H^+]=2{,}0\\cdot10^{-6}\\ \\mathrm{mol/L}$ ölçülüyor. Bu çözeltinin yaklaşık $[OH^-]$ değeri ve çözeltinin özelliği hangisidir?",
  "options": [
    "$2{,}0\\cdot10^{-8}\\ \\mathrm{mol/L}$ ve asidik",
    "$2{,}0\\cdot10^{-8}\\ \\mathrm{mol/L}$ ve bazik",
    "$5{,}0\\cdot10^{-9}\\ \\mathrm{mol/L}$ ve bazik",
    "$5{,}0\\cdot10^{-9}\\ \\mathrm{mol/L}$ ve asidik"
  ],
  "answerIndex": 2,
  "answer": "$5{,}0\\cdot10^{-9}\\ \\mathrm{mol/L}$ ve bazik",
  "rubric": [
    {
      "text": "$[H^+][OH^-]=1{,}0\\cdot10^{-14}$ bağıntısından $[OH^-]=5{,}0\\cdot10^{-9}\\ \\mathrm{mol/L}$ sonucunu seçer ve çözeltinin asidik olduğunu belirler.",
      "points": 3
    }
  ],
  "points": 3,
  "topic": "Sulu çözelti dengeleri",
  "difficulty": "medium",
  "lines": 0,
  "bloomLevel": 3,
  "fact": "25 °C'de suyun iyonlar çarpımı $K_{su}=[H^+][OH^-]=1,0\\cdot10^{-14}$ değerindedir.",
  "factId": "f26",
  "concept": "Suyun iyonlar çarpımı"
} as ExamQuestion,
  truth: 'D',
}

/** Matematik 11 S6: cos 2a = 1 - 2 (8/17)^2 = 161/289, the key says "\frac{97}{289}" (LaTeX, so it does not start with a digit). */
export const MATEMATIK_SHORT: WrongKeyCase = {
  source: "Trigonometride iki açının toplamının ve farkının trigonometrik oranları, tek tek açıların oranlarından hesaplanabilir. Toplam ve fark formülleri şunlardır: sin(a + b) = sin a · cos b + cos a · sin b, sin(a − b) = sin a · cos b − cos a · sin b, cos(a + b) = cos a · cos b − sin a · sin b ve cos(a − b) = cos a · cos b + sin a · sin b. Tanjant için tan(a + b) = (tan a + tan b) / (1 − tan a · tan b) bağıntısı kullanılır. Bu formüller sayesinde 15°, 75° ve 105° gibi özel olmayan açıların oranları 30°, 45° ve 60° açılarından bulunur.\n\nÖrnek olarak sin 75° değerini hesaplayalım. 75° = 45° + 30° olduğundan sin 75° = sin 45° · cos 30° + cos 45° · sin 30° olur. sin 45° = cos 45° = √2/2, cos 30° = √3/2 ve sin 30° = 1/2 olduğundan sin 75° = (√2/2)(√3/2) + (√2/2)(1/2) = (√6 + √2)/4 bulunur. Aynı yöntemle cos 15° = cos(45° − 30°) = cos 45° · cos 30° + sin 45° · sin 30° = (√6 + √2)/4 sonucuna ulaşılır. Bu iki değerin eşit olması, sin 75° = cos 15° olmasından beklenen bir sonuçtur, çünkü tümler açıların sinüs ve kosinüsleri eşittir.\n\nToplam formüllerinde a = b alınırsa iki kat açı formülleri elde edilir. sin 2a = 2 sin a cos a eşitliğidir. Kosinüs için cos 2a = cos² a − sin² a yazılır; sin² a + cos² a = 1 özdeşliği kullanılarak bu ifade cos 2a = 1 − 2 sin² a ya da cos 2a = 2 cos² a − 1 biçimlerine dönüştürülebilir. Tanjant için tan 2a = 2 tan a / (1 − tan² a) formülü geçerlidir. Örneğin sin a = 3/5 ve a dar açı ise cos a = 4/5 olduğundan sin 2a = 2 · (3/5) · (4/5) = 24/25 ve cos 2a = 16/25 − 9/25 = 7/25 bulunur.\n\nYarım açı formülleri iki kat açı formüllerinin yeniden düzenlenmesiyle elde edilir. cos 2a = 1 − 2 sin² a eşitliğinden sin² a = (1 − cos 2a)/2, cos 2a = 2 cos² a − 1 eşitliğinden ise cos² a = (1 + cos 2a)/2 yazılır. Bu formüller, kuvvetleri azaltmak ve integral gibi ileri konularda ifadeleri sadeleştirmek için kullanılır.\n\nTrigonometrik denklemlerin çözümünde bu formüllerden yararlanılır. sin 2x = sin x denklemini ele alalım. sin 2x = 2 sin x cos x olduğundan 2 sin x cos x = sin x ve sin x (2 cos x − 1) = 0 bulunur. Buradan sin x = 0 ya da cos x = 1/2 olur. [0°, 360°) aralığında sin x = 0 için x = 0° ve x = 180°, cos x = 1/2 için ise x = 60° ve x = 300° değerleri elde edilir. Çözüm kümesi {0°, 60°, 180°, 300°} biçiminde yazılır. Denklemin iki tarafını sin x ile bölmek kök kaybına yol açar; bu nedenle ortak çarpan parantezine alınmalıdır.",
  question: {
  "id": "qwd2grsyrqp8v",
  "type": "short-answer",
  "stem": "$\\sin a=\\frac{8}{17}$ ve $a$ dar açı olduğuna göre $\\cos 2a$ kaçtır?",
  "answer": "\\frac{97}{289}",
  "acceptableAnswers": [
    "\\frac{97}{289}"
  ],
  "rubric": [
    {
      "text": "\\frac{97}{289}",
      "points": 5
    }
  ],
  "points": 5,
  "topic": "Sinüsle kosinüs hesabı",
  "difficulty": "medium",
  "lines": 1,
  "bloomLevel": 3,
  "fact": "$\\sin a=\\frac{8}{17}$ ve $a$ dar açı ise $\\cos a=\\frac{15}{17}$ olduğundan $\\cos2a=1-2\\left(\\frac{8}{17}\\right)^2=\\frac{97}{289}$ bulunur.",
  "factId": "f24",
  "concept": "Kosinüs iki kat açı özdeşliği"
} as ExamQuestion,
  truth: '161/289',
}

/** Edebiyat 10 S7: the source names three settings for ashik poetry (weddings, village rooms, ashik cafes); "ayin ve sohbet" belongs to tekke poetry. */
export const EDEBIYAT_SHORT: WrongKeyCase = {
  source: "Halk edebiyatı, halkın içinden çıkan ve sözlü gelenekle yaşayan edebiyat koludur. Bu edebiyatın ürünleri üç ana grupta toplanır: anonim halk edebiyatı, âşık edebiyatı ve tekke edebiyatı. Anonim halk edebiyatında eserin şairi bilinmez; ürünler ağızdan ağıza aktarılırken değişir ve toplumun ortak malı olur. Mâniler, ninniler, türküler, atasözleri, bilmeceler, masallar ve halk hikâyeleri bu gruptadır. Mâni, genellikle yedi heceli ve dört dizelik bir nazım biçimidir; ilk iki dize genelde hazırlık, son iki dize asıl anlamı taşır.\n\nÂşık edebiyatı, saz eşliğinde söyleyen halk şairlerinin edebiyatıdır. Bu şairlere âşık ya da ozan denir. Âşıklar kendi şiirlerini bestelerler, düğünlerde, köy odalarında ve âşık kahvelerinde söylerler. Âşık edebiyatında şiirler genellikle hece ölçüsüyle yazılır. Karacaoğlan, Dadaloğlu, Köroğlu, Âşık Veysel ve Pir Sultan Abdal bu gelenekten gelen şairlerdir. Âşık, şiirinin son dörtlüğünde kendi mahlasını söyler. Bu geleneğin kalıplaşmış şiir biçimleri koşma, semai, varsağı ve destandır. Koşma, âşık edebiyatının en yaygın şiir biçimidir; genellikle on bir hecelidir ve dörtlüklerden oluşur. Dadaloğlu'nun \"Kalktı göç eyledi Avşar elleri\" dizesiyle başlayan şiiri, göçebe yaşamın sona ermesine duyulan hüznü anlatan ünlü bir koşmadır.\n\nTekke edebiyatı ise dinî ve tasavvufi temaların işlendiği bir koldur. Bu edebiyatın şairleri tekkelerde yetişmiş mutasavvıflardır. Şiirlerinde insan sevgisi, Allah aşkı, hoşgörü ve olgunlaşma düşüncesi yer alır. Tekke edebiyatının en büyük temsilcisi on üçüncü yüzyılda yaşamış Yunus Emre'dir. Yunus Emre, sade bir Türkçeyle yazmış, halkın anlayacağı bir dille insan sevgisini öne çıkarmıştır. Şu dizeler, onun şiirinde sevginin ne kadar önemli olduğunu gösterir:\n\n\"Ben gelmedim dava için\nBenim işim sevi içindir\nDostun evi gönüllerdir\nGönüller yapmaya geldim.\"\n\nBu dörtlükte şair, yaşamının amacının kavga etmek değil sevmek ve gönüller kazanmak olduğunu söyler. Yunus Emre'nin hece ölçüsüyle yazdığı ilahilerde sade bir dil ve içten bir anlatım hâkimdir. Tekke şiirinde ilahi, nefes, nutuk ve devriye gibi türler görülür. Âşık edebiyatında şiirin söylenişi ve saz önemlidir; tekke edebiyatında ise şiir daha çok ayinlerde ve sohbetlerde okunur.\n\nHalk edebiyatı ürünlerinin ortak özellikleri vardır. Dil sade ve anlaşılırdır, söyleyişte günlük konuşma diline yakınlık görülür. Ölçü olarak genellikle hece ölçüsü kullanılır. Konular arasında aşk, ayrılık, doğa, kahramanlık ve toplumsal sorunlar bulunur. Şiirlerde yarım uyak ve cinaslı uyak sık görülür. Bu edebiyat kolları, Türk toplumunun duygu ve düşüncesini, yaşayış biçimini ve değerlerini sonraki kuşaklara aktarmıştır.\n\nHalk hikâyeleri, anonim halk edebiyatının uzun anlatı ürünleridir. Halk hikâyelerinde nesir ve nazım iç içedir; olaylar düzyazıyla anlatılır, duygular şiirle dile getirilir. Köroğlu, Kerem ile Aslı, Âşık Garip, Tahir ile Zühre ve Leyla ile Mecnun bilinen halk hikâyeleridir. Halk hikâyelerinin bir bölümünde kahramanın rüyasında bade içip âşık olması, yani \"bade içme\" motifi görülür. Köroğlu hikâyesinde ise yiğitlik, haksızlığa karşı çıkma ve özgürlük teması öne çıkar. Halk hikâyeleri âşıklar tarafından kahvelerde ve toplantılarda anlatılır.",
  question: {
  "id": "qhyl579s1dzkb",
  "type": "short-answer",
  "stem": "Saz eşliğinin öne çıktığı şiir geleneğinde şiirler hangi iki ortamda okunur?",
  "answer": "Ayin ve sohbetlerde",
  "acceptableAnswers": [
    "Ayin ve sohbetlerde",
    "Ayinlerde ve sohbetlerde"
  ],
  "rubric": [
    {
      "text": "Ayin ve sohbetlerde",
      "points": 4
    }
  ],
  "points": 4,
  "topic": "Edebiyat karşılaştırması",
  "difficulty": "medium",
  "lines": 1,
  "bloomLevel": 2,
  "fact": "Âşık edebiyatında şiirin söylenişi ve saz önemliyken tekke edebiyatında şiir daha çok ayinlerde ve sohbetlerde okunur.",
  "factId": "f26",
  "concept": "Âşık ve tekke şiiri"
} as ExamQuestion,
  truth: 'düğünlerde ve köy odalarında',
}
