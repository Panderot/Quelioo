// Source texts for the quiz-quality accuracy run (tests/accuracy/quiz-quality.ts).
// A: the short photosynthesis text of the hand test (~74 words) — the short-source path.
// MD: a ~190-word markdown photosynthesis note (the setup that hit output truncation).
// B: cell structure, ~300 words. C: cell biology, ~1,500 words — long source, large counts.

export const TEXT_A =
  'Fotosentez, yeşil bitkilerin ışık enerjisini kullanarak kendi besinini ürettiği süreçtir. Bitki suyu kökleriyle topraktan emer, karbondioksiti ise yapraklarındaki stomalardan alır. Klorofil, ışığı soğuran yeşil pigmenttir ve kloroplast adı verilen organellerde bulunur. Işık enerjisi kimyasal enerjiye dönüştürülür ve karbondioksit glikoza çevrilir. Bu sırada oksijen açığa çıkar. Sıcaklık çok yükselirse enzimler bozulur ve fotosentez yavaşlar. Üretilen glikozun bir kısmı hemen kullanılır, fazlası ise nişasta olarak depolanır. Bu yüzden fotosentez, besin zincirinin başlangıcını oluşturan temel bir olaydır.'

export const TEXT_B = `Hücre, canlıların yapısal ve işlevsel en küçük birimidir. Bütün canlılar bir ya da daha fazla hücreden oluşur ve her hücre, var olan bir hücrenin bölünmesiyle meydana gelir. Bu fikirler hücre teorisinin temelini oluşturur.

Hücreler iki ana gruba ayrılır. Prokaryot hücrelerde çekirdek zarı yoktur; kalıtım maddesi sitoplazmada serbest hâlde bulunur. Bakteriler prokaryot canlılara örnektir. Ökaryot hücrelerde ise kalıtım maddesi zarla çevrili bir çekirdeğin içindedir. Hayvan, bitki ve mantar hücreleri ökaryottur.

Hücre zarı, hücreyi dış ortamdan ayıran ince ve esnek bir yapıdır. Fosfolipit çift tabakasından ve bu tabakaya gömülü proteinlerden oluşur. Hücre zarı seçici geçirgendir; bazı maddelerin geçişine izin verirken bazılarını engeller. Bitki hücrelerinde zarın dışında selülozdan yapılmış sağlam bir hücre duvarı da bulunur ve hücreye destek sağlar.

Sitoplazma, hücre zarı ile çekirdek arasını dolduran sıvı kısımdır. Organeller sitoplazmada yer alır. Mitokondri, besinlerdeki enerjiyi hücresel solunumla ATP'ye dönüştüren organeldir; bu nedenle enerji ihtiyacı yüksek olan kas hücrelerinde sayısı fazladır. Ribozomlar protein sentezler ve zarsız tek organeldir. Endoplazmik retikulum hücre içinde madde taşınmasını sağlar; üzerinde ribozom bulunan kısmına granüllü endoplazmik retikulum denir. Golgi cisimciği, proteinleri paketleyip salgılanmaya hazırlar.

Kloroplastlar yalnızca bitki hücrelerinde ve bazı tek hücrelilerde bulunur. İçlerindeki klorofil sayesinde ışık enerjisini kullanarak fotosentez yaparlar. Lizozomlar ise sindirim enzimleri taşır ve hücreye alınan besinleri ya da yıpranmış organelleri parçalar; hayvan hücrelerinde yaygındır.

Bitki hücrelerinde genellikle büyük bir merkezi koful bulunur. Bu koful su depolar ve hücrenin turgor basıncını korumasına yardım eder. Hayvan hücrelerindeki kofullar ise küçük ve çok sayıdadır. Hayvan hücrelerinde hücre bölünmesine yardım eden sentrozom bulunurken çoğu bitki hücresinde bu yapı yoktur.

Çekirdek, hücrenin yönetim merkezidir. İçinde DNA bulunur ve hücrenin hangi proteinleri üreteceğini belirler. Çekirdekçik ise ribozomların yapımında görev alır.

Hücrenin bölümleri birlikte çalışır. Örneğin bir protein ribozomda üretilir, endoplazmik retikulumla taşınır, Golgi cisimciğinde paketlenir ve hücre zarından dışarı salgılanır. Bu iş için gereken enerjiyi mitokondri sağlar.`

export const TEXT_C = `Hücre biyolojisi, canlıların temel birimi olan hücrenin yapısını, işleyişini ve çoğalmasını inceleyen bilim dalıdır. Hücrenin keşfi mikroskobun gelişmesiyle mümkün olmuştur. On yedinci yüzyılda Robert Hooke, mantar dokusundan aldığı ince bir kesiti incelerken küçük boşluklar görmüş ve bunlara hücre adını vermiştir. Hooke'un gördüğü yapılar aslında ölü hücrelerin duvarlarıydı. Kısa süre sonra Antonie van Leeuwenhoek, kendi yaptığı güçlü merceklerle göl suyundaki canlı tek hücrelileri ilk kez gözlemlemiştir.

On dokuzuncu yüzyılda Matthias Schleiden bitkilerin, Theodor Schwann ise hayvanların hücrelerden oluştuğunu göstermiştir. Rudolf Virchow da her hücrenin var olan bir hücreden meydana geldiğini ileri sürmüştür. Bu çalışmalar hücre teorisini oluşturmuştur. Hücre teorisine göre bütün canlılar bir ya da daha fazla hücreden oluşur, hücre canlıların yapı ve görev birimidir ve yeni hücreler yalnızca var olan hücrelerin bölünmesiyle oluşur.

Hücreler büyüklük ve biçim bakımından çok çeşitlidir. Çoğu hücre çıplak gözle görülemeyecek kadar küçüktür ve mikrometre ile ölçülür. Hücrelerin küçük olmasının önemli bir nedeni yüzey alanı ile hacim arasındaki ilişkidir. Bir hücre büyüdükçe hacmi yüzey alanından daha hızlı artar. Madde alışverişi zar yüzeyinden yapıldığı için çok büyük bir hücre, ihtiyaç duyduğu maddeleri yeterince hızlı alamaz ve atıklarını yeterince hızlı uzaklaştıramaz. Bu yüzden hücreler belirli bir büyüklüğe ulaşınca bölünür. Sinir hücreleri gibi bazı hücreler ise uzun uzantılar sayesinde yüzey alanını artırır.

Canlılar hücre yapısına göre prokaryotlar ve ökaryotlar olarak ikiye ayrılır. Prokaryot hücrelerde zarla çevrili bir çekirdek ve zarlı organeller bulunmaz. Kalıtım maddesi, sitoplazmada nükleoid denen bölgede halka biçimli bir DNA olarak yer alır. Bakteriler ve arkeler prokaryottur. Prokaryotların çoğunda hücre zarının dışında bir hücre duvarı, bazılarında ise kapsül ve hareketi sağlayan kamçı bulunur. Ökaryot hücreler daha büyüktür ve kalıtım maddesini çift katlı bir zarla çevrili çekirdekte saklar. Ökaryot hücrelerde zarlı organeller sayesinde farklı işler ayrı bölmelerde aynı anda yürütülebilir.

Hücre zarı, bütün hücrelerde bulunan ve hücreyi çevresinden ayıran yapıdır. Zarın temelini fosfolipit çift tabakası oluşturur. Fosfolipitlerin suyu seven başları zarın iki yüzeyine, suyu sevmeyen kuyrukları ise zarın ortasına yönelir. Bu tabakanın içine ve yüzeyine yerleşmiş proteinler, maddelerin taşınmasında, sinyallerin alınmasında ve hücrelerin birbirini tanımasında görev alır. Hayvan hücrelerinde zarın yapısında bulunan kolesterol, zarın akışkanlığını düzenler. Zarın yapısı sabit değildir; fosfolipitler ve proteinler zar içinde yer değiştirebilir. Bu nedenle zarın yapısı akıcı mozaik modeli ile açıklanır.

Hücre zarı seçici geçirgendir. Oksijen ve karbondioksit gibi küçük moleküller zardan kolayca geçerken iyonlar ve büyük moleküller ancak taşıyıcı proteinlerin yardımıyla geçebilir. Maddelerin çok yoğun olduğu yerden az yoğun olduğu yere enerji harcanmadan geçmesine difüzyon denir. Suyun seçici geçirgen bir zardan az yoğun çözeltiden çok yoğun çözeltiye doğru geçmesine ise osmoz denir. Bir hayvan hücresi saf suya konursa osmozla su alır, şişer ve sonunda patlayabilir. Bitki hücresi ise hücre duvarı sayesinde patlamaz; şişen hücrede oluşan bu basınca turgor basıncı denir. Tuzlu suya konan bitki hücresi ise su kaybeder ve sitoplazması büzülür; bu olaya plazmoliz denir.

Bazı maddeler hücreye az yoğun ortamdan çok yoğun ortama doğru taşınır. Bu taşıma yoğunluk farkına karşı yapıldığı için enerji gerektirir ve aktif taşıma olarak adlandırılır. Aktif taşımada kullanılan enerji ATP'den sağlanır. Örneğin sinir hücrelerinde sodyum-potasyum pompası, sodyumu hücre dışına, potasyumu ise hücre içine sürekli olarak pompalar. Büyük moleküller ise zarın cep oluşturmasıyla hücre içine alınır; buna endositoz denir. Hücrenin salgı maddelerini zar keseleri yoluyla dışarı atmasına ise ekzositoz denir.

Sitoplazma, hücre zarı ile çekirdek arasını dolduran yarı akışkan bölümdür. Büyük kısmı sudan oluşur ve içinde çözünmüş iyonlar, şekerler, amino asitler ve enzimler bulunur. Birçok metabolik tepkime sitoplazmada gerçekleşir. Sitoplazmada ayrıca hücreye biçim veren ve organellerin hareketini sağlayan protein ipliklerinden oluşmuş bir hücre iskeleti bulunur. Hücre iskeleti, hücre bölünmesi sırasında kromozomların ayrılmasında da görev alır.

Çekirdek, ökaryot hücrelerin yönetim merkezidir. Çift katlı çekirdek zarı ile çevrilidir ve bu zar üzerinde madde alışverişini sağlayan çekirdek porları bulunur. Çekirdeğin içinde DNA ve proteinlerden oluşan kromatin bulunur. Hücre bölünmeye başladığında kromatin kısalıp kalınlaşarak kromozomları oluşturur. DNA, hücrenin hangi proteinleri hangi zamanda üreteceğini belirleyen kalıtsal bilgiyi taşır. Çekirdeğin içindeki çekirdekçik, ribozomların yapımında görev alır. Olgun alyuvarlar gibi çekirdeği olmayan hücreler bölünemez ve ömürleri sınırlıdır.

Ribozomlar, protein sentezinin yapıldığı küçük organellerdir. Zarla çevrili değildir ve hem prokaryot hem ökaryot hücrelerde bulunur. Bazı ribozomlar sitoplazmada serbest hâlde, bazıları ise endoplazmik retikulumun üzerinde yer alır. Serbest ribozomlar genellikle hücre içinde kullanılacak proteinleri, endoplazmik retikuluma bağlı ribozomlar ise salgılanacak ya da zara yerleşecek proteinleri üretir.

Endoplazmik retikulum, çekirdek zarından başlayıp sitoplazmaya yayılan kanallar ağıdır. Üzerinde ribozom bulunan kısmına granüllü endoplazmik retikulum denir ve bu kısım proteinlerin üretilmesi ve taşınmasında görev alır. Ribozom bulunmayan kısmına granülsüz endoplazmik retikulum denir; bu kısım yağların ve bazı hormonların sentezinde, karaciğer hücrelerinde ise zararlı maddelerin etkisiz hâle getirilmesinde görev yapar.

Golgi cisimciği, üst üste dizilmiş yassı keselerden oluşur. Endoplazmik retikulumdan gelen proteinleri ve yağları değiştirir, paketler ve gidecekleri yere gönderir. Bu nedenle salgı yapan hücrelerde, örneğin sindirim enzimi üreten pankreas hücrelerinde, Golgi cisimciği çok gelişmiştir. Golgi cisimciğinden ayrılan bazı keseler lizozomları oluşturur.

Lizozomlar, sindirim enzimleri içeren zarla çevrili keselerdir. Hücreye alınan besin parçacıklarını, bakterileri ve yıpranmış organelleri parçalar. Lizozom zarı, enzimlerin hücrenin kendi yapılarını sindirmesini engeller. Akyuvarlarda lizozom sayısı fazladır, çünkü bu hücreler mikropları içine alıp sindirir. Lizozomlar hayvan hücrelerinde yaygındır.

Mitokondri, hücresel solunumun gerçekleştiği organeldir. Çift katlı zarla çevrilidir; iç zar kıvrımlar oluşturarak yüzey alanını artırır. Mitokondride besinlerdeki kimyasal enerji oksijen kullanılarak ATP'ye dönüştürülür. ATP, hücrenin doğrudan kullanabildiği enerji molekülüdür. Kas hücreleri ve sinir hücreleri gibi enerji ihtiyacı yüksek hücrelerde mitokondri sayısı fazladır. Mitokondrinin kendine ait DNA'sı ve ribozomları vardır ve mitokondri kendini eşleyebilir.

Kloroplastlar bitki hücrelerinde ve bazı tek hücreli canlılarda bulunur. Mitokondri gibi çift katlı zarla çevrilidir ve kendine ait DNA'sı vardır. Kloroplastın içinde tilakoit denen zar keseleri üst üste dizilerek granumları oluşturur. Tilakoit zarlarında bulunan klorofil, ışık enerjisini soğurur. Kloroplastta ışık enerjisi kullanılarak karbondioksit ve sudan glikoz üretilir ve bu sırada oksijen açığa çıkar. Böylece kloroplast ışık enerjisini kimyasal enerjiye, mitokondri ise bu kimyasal enerjiyi hücrenin kullanabileceği ATP'ye çevirir.

Kofullar, zarla çevrili depolama keseleridir. Olgun bitki hücrelerinde genellikle hücre hacminin büyük kısmını kaplayan tek bir merkezi koful bulunur. Merkezi koful su, iyonlar ve bazı atık maddeleri depolar; su ile dolduğunda hücre duvarına baskı yaparak bitkinin dik durmasına yardım eder. Bir bitki uzun süre susuz kalırsa kofullar su kaybeder ve bitki solar. Tatlı suda yaşayan bazı tek hücrelilerde bulunan kontraktil koful ise osmozla hücreye giren fazla suyu dışarı atar.

Sentrozom, hayvan hücrelerinde çekirdeğe yakın bulunan ve birbirine dik duran iki sentriolden oluşan yapıdır. Hücre bölünmesi sırasında iğ ipliklerinin oluşmasını sağlar. Çoğu bitki hücresinde sentrozom bulunmaz; bitki hücreleri iğ ipliklerini başka yapılar yardımıyla oluşturur.

Bitki hücrelerinde hücre zarının dışında selülozdan yapılmış bir hücre duvarı bulunur. Hücre duvarı hücreye destek ve koruma sağlar, hücrenin biçimini korur ve aşırı su alındığında patlamayı önler. Komşu bitki hücreleri, hücre duvarlarındaki geçitler aracılığıyla birbirleriyle madde alışverişi yapar. Mantarların hücre duvarı ise kitinden yapılmıştır.

Hücreler büyüyüp belirli bir büyüklüğe ulaştığında bölünür. Ökaryot hücrelerde vücut hücrelerinin bölünmesine mitoz denir. Mitozdan önce DNA eşlenir; bölünme sonunda ana hücreyle aynı kalıtsal bilgiye sahip iki yavru hücre oluşur. Mitoz, çok hücreli canlılarda büyümeyi, yaraların onarılmasını ve yıpranan hücrelerin yenilenmesini sağlar. Üreme hücrelerinin oluşumunda ise mayoz bölünme görülür; mayoz sonunda kromozom sayısı yarıya inmiş dört hücre oluşur. Bu sayede döllenme sırasında kromozom sayısı nesiller boyunca sabit kalır.

Hücre bölünmesinin denetimi bozulduğunda hücreler kontrolsüz biçimde çoğalabilir. Bu durum kanser hastalığının temelini oluşturur. Sağlıklı hücrelerde bölünme, hücrenin büyüklüğü, besin durumu ve DNA'nın sağlam olup olmadığı gibi koşullara göre düzenlenir.

Çok hücreli canlılarda hücreler görevlerine göre farklılaşır. Aynı yapıdaki ve aynı görevi yapan hücreler bir araya gelerek dokuları, dokular organları, organlar da sistemleri oluşturur. Örneğin kas hücreleri kasılabilen uzun hücrelerdir, sinir hücreleri uzun uzantılarıyla uyarıları iletir, alyuvarlar ise çekirdeklerini kaybederek daha fazla hemoglobin taşır ve oksijen taşınmasını kolaylaştırır. Hücrelerin yapısı ile görevleri arasındaki bu uyum, hücre biyolojisinin en önemli fikirlerinden biridir.

Hücreler arasında iletişim de çok hücreli yaşam için gereklidir. Hücreler, hormonlar gibi sinyal molekülleri salgılayarak birbirlerine mesaj gönderir. Sinyal molekülü, hedef hücrenin zarındaki ya da içindeki reseptör denen özel proteinlere bağlanır. Reseptör yalnızca kendine uygun sinyal molekülünü tanır; bu nedenle bir hormon vücuttaki bütün hücreleri değil, yalnızca uygun reseptöre sahip hedef hücreleri etkiler. Örneğin pankreastan salgılanan insülin, kas ve karaciğer hücrelerinin kandan glikoz almasını artırır. Sinir hücreleri ise uyarıyı bir sonraki hücreye sinaps denen bağlantı noktasında salgıladıkları kimyasal maddelerle iletir.

Hücrelerin yaşlanması ve ölmesi de doğal süreçlerdir. Programlı hücre ölümü, yıpranmış ya da hasar görmüş hücrelerin vücuda zarar vermeden ortadan kaldırılmasını sağlar. Gelişim sırasında da önemli bir görev üstlenir; örneğin insan embriyosunda parmakların arasındaki hücreler programlı hücre ölümüyle yok olur ve parmaklar birbirinden ayrılır. Bu süreç bozulduğunda hasarlı hücreler vücutta kalabilir.

Bilim insanları hücreleri incelemek için farklı yöntemler kullanır. Işık mikroskobu canlı hücrelerin gözlenmesine olanak verir, ancak çok küçük yapıları ayırt edemez. Elektron mikroskobu ise ışık yerine elektron demeti kullanır ve organellerin iç yapısını çok daha ayrıntılı gösterir; fakat bu mikroskopla yalnızca özel olarak hazırlanmış ölü örnekler incelenebilir. Hücre kültürü yönteminde ise hücreler laboratuvarda besin ortamında çoğaltılır ve ilaçların hücrelere etkisi bu yolla araştırılabilir.`

export const TEXT_MD = `# Fotosentez

**Fotosentez**, yeşil bitkilerin, alglerin ve bazı bakterilerin *ışık enerjisini* kullanarak kendi besinlerini ürettiği süreçtir.

## Gerekli maddeler

- **Su (H₂O):** Bitki suyu kökleriyle topraktan emer ve odun boruları ile yapraklara taşır.
- **Karbondioksit (CO₂):** Yapraklardaki *stomalar* adı verilen küçük açıklıklardan girer.
- **Işık:** Güneş ışığı, klorofil tarafından soğurulur.

## Nerede gerçekleşir?

Fotosentez, bitki hücrelerindeki **kloroplast** adı verilen organellerde gerçekleşir. Kloroplastların içinde ışığı soğuran yeşil pigment olan **klorofil** bulunur. Klorofil en çok kırmızı ve mavi ışığı soğurur, yeşil ışığı ise yansıtır; bu yüzden yapraklar yeşil görünür.

## Ürünler

1. **Glikoz:** Karbondioksit glikoza çevrilir. Glikozun bir kısmı hemen enerji için kullanılır, fazlası **nişasta** olarak depolanır.
2. **Oksijen:** Suyun parçalanmasıyla açığa çıkar ve stomalardan atmosfere verilir.

## Etkileyen faktörler

> Işık şiddeti, karbondioksit miktarı ve sıcaklık fotosentez hızını etkiler.

Sıcaklık çok yükselirse enzimler bozulur ve fotosentez yavaşlar. Işık şiddeti arttıkça fotosentez hızı belli bir noktaya kadar artar, sonra sabit kalır.

Fotosentez, besin zincirinin başlangıcını oluşturur ve atmosferdeki oksijenin büyük kısmını sağlar.

## Neden önemli?

Otçul hayvanlar bitkileri yiyerek bu enerjiyi alır; etçiller de otçulları yiyerek enerjiyi devralır. Bu nedenle neredeyse bütün canlılar, doğrudan ya da dolaylı olarak fotosentezle üretilen besine bağlıdır. Ormanların azalması bu dengeyi bozar.`
