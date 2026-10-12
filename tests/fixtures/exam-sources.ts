// Source texts of about 700 words, the length of a textbook section a teacher pastes in to make a written exam.

export interface ExamSource {
  text: string
  course: string
  grade: string
  level: '8' | '9' | '10'
  topics: string[]
}

export const LONG_SOURCES: Record<'history' | 'math' | 'science', ExamSource> = {
  history: {
    course: 'Tarih',
    grade: '9',
    level: '9',
    topics: ['Orta Asya Türk devletleri', 'Türklerde devlet teşkilatı', 'İlk Müslüman Türk devletleri'],
    text: `İlk Türk devletleri Orta Asya'da kurulmuştur. Bilinen en eski Türk devletlerinden biri Asya Hun Devleti'dir. Teoman'ın oğlu Mete Han, M.Ö. 209 yılında tahta çıkmış, orduyu onlu sisteme göre düzenlemiş ve devleti en geniş sınırlarına ulaştırmıştır. Hun ordusunda her on askerin başında bir kumandan bulunur, bu sistem yüzlük, binlik ve onbinlik birliklere kadar uzanırdı. Ülke, doğu ve batı olmak üzere iki ana bölüme ayrılmıştı; bu bölümler hükümdarın yakın akrabaları tarafından yönetiliyordu. Hunlar Çin ile uzun süre mücadele etmiş, Çinliler Hun saldırılarından korunmak için Çin Seddi'ni güçlendirmiştir.

Göktürkler 552 yılında Bumin Kağan önderliğinde Avar egemenliğine son vererek devletlerini kurdular. Devlet, Bumin ile kardeşi İstemi Yabgu arasında doğu ve batı olarak paylaşılmıştır. Göktürkler, Türk adını bir devletin adı olarak kullanan ilk Türk topluluğudur. Orhun Yazıtları olarak bilinen Bilge Kağan, Kül Tigin ve Tonyukuk yazıtları 8. yüzyılda dikilmiş, Türkçenin bilinen en eski yazılı belgeleridir. Yazıtlarda Türk milletinin bağımsızlık mücadelesi, devletin zayıflama nedenleri ve halka öğütler anlatılır. Göktürk alfabesi, yazıtların bulunduğu Orhun Vadisi'nin adıyla anılan Orhun alfabesidir. Göktürk Devleti bir süre Çin egemenliği altında kaldıktan sonra Kutluk Kağan önderliğinde yeniden bağımsızlığını kazanmıştır.

Türklerde devlet yönetiminde kağan, töre denilen kurallara bağlıydı. Kağanın yetkileri danışma meclisi olan kurultay ile sınırlandırılmıştı. Kurultay; devlet işlerinin, savaş ve barış kararlarının ve kağan seçiminin görüşüldüğü meclisti. Hükümdarın halka karşı sorumluluğu, devlet anlayışında önemli bir yer tutardı. Hükümdarlık "kut" anlayışına dayanır; Türklere göre yönetme yetkisi Tanrı tarafından kağana verilmiştir. Devlet, hanedan üyelerinin hepsinin yönetimde söz sahibi olduğu bir ortak egemenlik anlayışıyla yönetilirdi.

Uygurlar ise 744 yılında Göktürklerin yıkılmasından sonra Ötüken bölgesinde devlet kurdu. Uygurlar yerleşik hayata geçen ilk Türk topluluklarından biridir; tarım, ticaret ve el sanatlarıyla uğraştılar. Maniheizm ve Budizm'i kabul ettiler, Uygur alfabesini kullandılar ve kağıt, matbaa gibi alanlarda kültürel katkılar yaptılar. Başkentleri Ordubalık'tı. Uygur Devleti 840 yılında Kırgızların saldırısıyla yıkılmıştır.

Türklerin Müslümanlığı kabul etmesi 10. yüzyılda hızlanmıştır. Karahanlılar, Türklerin Müslümanlığı devlet olarak kabul eden ilk devletidir; Satuk Buğra Han İslam'ı kabul etmiştir. Karahanlılar döneminde Yusuf Has Hacib, 1069 yılında Kutadgu Bilig adlı eseri yazmıştır; eser, devlet yönetimi ve mutlu olma yollarını anlatan bir siyasetnamedir. Kaşgarlı Mahmut ise 1072 yılında, Arapça yazdığı Divanü Lügati't-Türk adlı sözlükte Türk dilini ve Türk boylarını tanıtmıştır. Bu eser Türkçenin ilk sözlüğü kabul edilir.

Gazneliler, 962 yılında Gazne şehrinde kurulan Türk devletidir ve en parlak dönemini Sultan Mahmut'un hükümdarlığında yaşamıştır. Sultan Mahmut Hindistan'a birçok sefer düzenlemiş, Hindistan'da İslam'ın yayılmasına katkıda bulunmuştur. Gaznelilerde ordu, Türk askerlerinden oluşuyordu.

Büyük Selçuklu Devleti'nin kurucusu Tuğrul Bey'dir. Selçuklular, 1040 yılında Dandanakan Savaşı'nda Gazneli ordusunu yenerek Horasan'ın hâkimi oldular ve bu zaferle devletlerini kurdular. Tuğrul Bey, 1055 yılında Bağdat'a girerek Abbasi halifesini Büyük Selçuklu himayesine aldı ve "Sultan" unvanını aldı. Alparslan, 1071 yılında Malazgirt Savaşı'nda Bizans İmparatoru Romanos Diogenes'i yenmiş; bu zaferle Anadolu'nun kapıları Türklere açılmıştır. Melikşah döneminde devlet en geniş sınırlarına ulaşmıştır. Vezir Nizamülmülk, Nizamiye Medreselerini açmış ve devlet yönetimini anlatan Siyasetname adlı eseri yazmıştır. Nizamiye Medreseleri, Selçuklu döneminin önemli eğitim kurumlarıdır.`,
  },
  math: {
    course: 'Matematik',
    grade: '10',
    level: '10',
    topics: ['İkinci dereceden denklemler', 'Diskriminant', 'Kökler toplamı ve çarpımı', 'Parabol'],
    text: `İkinci dereceden bir bilinmeyenli denklem, a ≠ 0 olmak üzere ax² + bx + c = 0 biçiminde yazılır. Burada a, b ve c gerçek sayılardır; a sayısına baş katsayı, c sayısına sabit terim denir. Denklemin köklerini bulmanın birkaç yolu vardır: çarpanlara ayırma, tam kareye tamamlama ve kök formülü.

Çarpanlara ayırma yönteminde denklem (x − x₁)(x − x₂) = 0 biçimine getirilir. Örneğin x² − 5x + 6 = 0 denklemi (x − 2)(x − 3) = 0 biçiminde yazılır ve kökler x = 2 ile x = 3 olur. Tam kareye tamamlamada denklem, bir ifadenin karesi biçimine getirilir. Örneğin x² + 6x + 5 ifadesi (x + 3)² − 4 olarak yazılır, bu nedenle x² + 6x + 5 = 0 denkleminin kökleri x = −1 ve x = −5 olur.

Denklemin köklerini bulmak için diskriminant kullanılır. Diskriminant Δ = b² − 4ac ifadesiyle hesaplanır. Δ > 0 ise denklemin birbirinden farklı iki gerçek kökü vardır; Δ = 0 ise denklemin eşit iki gerçek kökü (çift katlı kök) bulunur; Δ < 0 ise denklemin gerçek kökü yoktur. Kökler, x₁,₂ = (−b ± √Δ) / (2a) formülüyle bulunur.

Örnek 1: 2x² + 3x − 2 = 0 denkleminde a = 2, b = 3, c = −2 olduğundan Δ = 9 + 16 = 25 olur. Kökler x₁ = (−3 + 5)/4 = 1/2 ve x₂ = (−3 − 5)/4 = −2 bulunur. Örnek 2: x² + 4x + 4 = 0 denkleminde Δ = 16 − 16 = 0 olduğundan denklemin çift katlı kökü x = −2 olur. Örnek 3: x² + 2x + 5 = 0 denkleminde Δ = 4 − 20 = −16 olduğundan denklemin gerçek kökü yoktur.

Kökler toplamı ve çarpımı katsayılardan doğrudan bulunabilir. Köklerin toplamı x₁ + x₂ = −b/a, çarpımı ise x₁ · x₂ = c/a değerine eşittir. Örneğin 2x² − 6x + 4 = 0 denkleminde kökler toplamı 3, kökler çarpımı 2 olur. Kökleri x₁ ve x₂ olan ikinci dereceden denklem x² − (x₁ + x₂)x + x₁x₂ = 0 biçiminde yazılabilir. Örneğin kökleri 2 ve −3 olan denklem x² + x − 6 = 0 olur. Kökleri 4 ve −1 olan denklem ise x² − 3x − 4 = 0 biçimindedir.

Denklemin köklerinin durumu bir parametreye bağlı olabilir. Örneğin x² − 4x + m = 0 denkleminin eşit iki gerçek kökü olması için Δ = 16 − 4m = 0 olmalıdır; bu durumda m = 4 bulunur. Aynı denklemin iki farklı gerçek kökü olması için 16 − 4m > 0, yani m < 4 olmalıdır.

Bir ikinci dereceden fonksiyonun grafiği paraboldür. y = ax² + bx + c fonksiyonunda a > 0 ise parabolün kolları yukarı, a < 0 ise aşağı doğrudur. Parabolün tepe noktasının apsisi x = −b/(2a) değerindedir; ordinatı bu değer fonksiyonda yerine yazılarak bulunur. Parabolün simetri ekseni, tepe noktasından geçen dikey doğrudur ve denklemi x = −b/(2a) olur. Parabol x eksenini Δ > 0 ise iki noktada keser, Δ = 0 ise tek noktada teğet olur, Δ < 0 ise x eksenini kesmez. Parabol y eksenini (0, c) noktasında keser.

Örnek 4: y = x² − 4x + 3 fonksiyonunda a = 1 > 0 olduğundan kollar yukarı doğrudur. Tepe noktasının apsisi x = 2, ordinatı y = 4 − 8 + 3 = −1 olduğundan tepe noktası (2, −1) olur. Δ = 16 − 12 = 4 > 0 olduğu için parabol x eksenini x = 1 ve x = 3 noktalarında keser, y eksenini ise (0, 3) noktasında keser. Örnek 5: y = −x² + 2x + 3 fonksiyonunda a = −1 < 0 olduğundan kollar aşağı doğrudur. Tepe noktasının apsisi x = 1, ordinatı y = −1 + 2 + 3 = 4 olduğundan tepe noktası (1, 4) olur; parabol x eksenini x = −1 ve x = 3 noktalarında keser.

Bir ikinci dereceden fonksiyonun en büyük ya da en küçük değeri tepe noktasının ordinatıdır. a > 0 ise fonksiyonun en küçük değeri vardır ve bu değer tepe noktasının ordinatıdır; a < 0 ise fonksiyonun en büyük değeri vardır. Örneğin y = −x² + 2x + 3 fonksiyonunun en büyük değeri 4'tür.`,
  },
  science: {
    course: 'Science',
    grade: '8',
    level: '8',
    topics: ['States of matter', 'Changes of state', 'Density'],
    text: `Matter is anything that has mass and takes up space. It is usually found in three common states: solid, liquid and gas. In a solid, the particles are packed closely together in a fixed pattern and can only vibrate in place, so a solid keeps its own shape and volume. In a liquid, the particles are close together but can slide past one another. A liquid has a fixed volume but takes the shape of its container. In a gas, the particles are far apart and move quickly in all directions, so a gas has no fixed shape or volume and fills any container. A fourth state, plasma, is found in lightning and in the Sun; in plasma the particles are so energetic that they have lost some of their electrons.

Temperature is a measure of how fast the particles of a substance move on average. When a substance is heated, its particles gain energy and move faster; when it is cooled, they lose energy and move more slowly. Heat always flows from a warmer object to a cooler one.

A change of state happens when matter is heated or cooled. Melting is the change from solid to liquid, and freezing is the reverse. Water melts and freezes at 0 degrees Celsius. Boiling is the change from liquid to gas that happens throughout the liquid, while evaporation is the change from liquid to gas that happens only at the surface and can occur at any temperature. Condensation is the change from gas back to liquid. Water boils at 100 degrees Celsius at sea level; at high altitude the air pressure is lower, so water boils at a lower temperature. Sublimation is a change directly from solid to gas without becoming a liquid; dry ice, which is solid carbon dioxide at minus 78.5 degrees Celsius, shows sublimation. Deposition is the reverse change, from gas directly to solid, and it forms frost on cold surfaces.

During a change of state the temperature stays constant even though heat is still being added, because the energy is used to separate the particles rather than to make them move faster. This is why a pot of boiling water stays at 100 degrees Celsius however strongly it is heated, and why ice water stays at 0 degrees Celsius until all of the ice has melted. When heat is removed from a gas, its particles slow down, and the gas condenses; this is how clouds and dew form. Evaporation has a cooling effect, because the fastest particles leave the liquid and take energy with them. Sweating cools the body for this reason.

Density describes how much mass a substance has in a given volume. It is calculated with the formula density = mass divided by volume. For example, a block with a mass of 200 grams and a volume of 50 cubic centimetres has a density of 4 grams per cubic centimetre. A second block with a mass of 90 grams and a volume of 100 cubic centimetres has a density of 0.9 grams per cubic centimetre. Volume can be found by dividing mass by density, and mass by multiplying density by volume.

Objects with a density lower than water, which is 1 gram per cubic centimetre, float, while denser objects sink. Wood has a density of about 0.5 grams per cubic centimetre and floats, while iron has a density of 7.8 grams per cubic centimetre and sinks. Aluminium has a density of 2.7 grams per cubic centimetre, lead 11.3 and gold 19.3. Cooking oil has a density of about 0.9 grams per cubic centimetre, so it floats on water. Mercury, a liquid metal, has a density of 13.6 grams per cubic centimetre, so most metals float on it.

Ice floats on liquid water because water expands when it freezes, which makes ice less dense than liquid water. This property is unusual, since most substances are denser as solids than as liquids. Because ice floats, lakes freeze from the top down, and the water beneath the ice stays liquid, which protects the animals that live there during the winter.

Most substances expand when they are heated, because their particles move faster and take up more space, and contract when they are cooled. This is why a gap is left between the sections of a bridge. The density of a substance usually falls as it is heated, because the same mass takes up a larger volume.`,
  },
}

/** The maths section plus a second half (inequalities, word problems, root relations): enough material for a 40-question exam. */
export const MATH_FORTY: ExamSource = {
  ...LONG_SOURCES.math,
  text: `${LONG_SOURCES.math.text}

İkinci dereceden eşitsizliklerde önce ilgili denklemin kökleri bulunur, sonra parabolün işaretine bakılır. Örneğin x² − 5x + 6 > 0 eşitsizliğinde denklemin kökleri 2 ve 3'tür; a = 1 > 0 olduğundan parabol kökler dışında pozitiftir, bu nedenle çözüm kümesi x < 2 veya x > 3 olur. x² − 5x + 6 < 0 eşitsizliğinin çözüm kümesi ise 2 < x < 3 aralığıdır. x² + 1 > 0 eşitsizliği ise Δ < 0 ve a > 0 olduğundan her gerçek sayı için doğrudur.

Köklerin kareleri toplamı, kökler toplamı ve çarpımı yardımıyla bulunur: x₁² + x₂² = (x₁ + x₂)² − 2x₁x₂. Örneğin x² − 7x + 12 = 0 denkleminde kökler toplamı 7, kökler çarpımı 12 olduğundan x₁² + x₂² = 49 − 24 = 25 olur; kökler 3 ve 4'tür. Köklerin ters değerleri toplamı ise 1/x₁ + 1/x₂ = (x₁ + x₂)/(x₁x₂) formülüyle bulunur; aynı denklemde bu değer 7/12'dir. Kökler arasındaki fark |x₁ − x₂| = √Δ / |a| ile hesaplanır; x² − 7x + 12 = 0 denkleminde fark 1'dir.

Köklerden biri verildiğinde denklemdeki bilinmeyen katsayı bulunabilir. Örneğin x² + mx − 6 = 0 denkleminin köklerinden biri 2 ise 4 + 2m − 6 = 0 olduğundan m = 1 bulunur; diğer kök, çarpım −6 olduğundan −3'tür. Bir denklemin gerçek kökünün olması için Δ ≥ 0 olmalıdır; örneğin x² + 2x + m = 0 denkleminin gerçek kökü olması için 4 − 4m ≥ 0, yani m ≤ 1 olmalıdır.

Problemlerde bilinmeyen bir uzunluk x olarak seçilir ve verilen koşuldan denklem kurulur. Örnek 6: Kenar uzunlukları x ve x + 3 olan bir dikdörtgenin alanı 28 ise x(x + 3) = 28, yani x² + 3x − 28 = 0 olur; kökler 4 ve −7 olduğundan uzunluk negatif olamayacağı için x = 4 bulunur ve dikdörtgenin kenarları 4 ile 7'dir. Örnek 7: Toplamları 10 olan iki sayının çarpımı en çok kaç olabilir? Sayılar x ve 10 − x ise çarpım y = x(10 − x) = −x² + 10x fonksiyonudur; a = −1 < 0 olduğundan en büyük değer tepe noktasındadır, x = 5 için çarpım 25 olur.

Bir parabolün yatay ya da düşey kaydırılması denklemini değiştirir. y = x² parabolü 2 birim sağa ve 3 birim yukarı kaydırılırsa y = (x − 2)² + 3 olur ve tepe noktası (2, 3) olur. Bir parabolün tepe noktası (r, k) ise denklemi y = a(x − r)² + k biçiminde yazılır. Simetri ekseni x = r doğrusudur. Örneğin tepe noktası (1, 4) olan ve (0, 3) noktasından geçen parabol y = −(x − 1)² + 4 denklemine sahiptir; çünkü 3 = a · 1 + 4 olduğundan a = −1'dir.`,
}
