import type { BlockerLocale } from "./blocker";

// The seven student reviews the welock.in sidebar unit rotates through —
// the site's own testimonials, in the site's own translations, with each
// person's real programme, school and logo. Regenerated from
// www.welock.in's localized pages; edit there, not here.

export type BlockerReview = {
  who: string;
  /** School, as a name (the logo carries it visually). */
  where: string;
  /** Under /public. */
  photo: string;
  logo: string;
  /** The quote, with each language's own quotation marks. */
  text: Record<BlockerLocale, string>;
  /** Programme, as the site translates it. */
  role: Record<BlockerLocale, string>;
};

export const BLOCKER_REVIEWS: readonly BlockerReview[] = [
  {
    who: "Sarah Fourati",
    where: "HEC Paris",
    photo: "/images/blocker/people/sarah-fourati.webp",
    logo: "/images/blocker/logos/27_HEC.webp",
    text: {
      en: "“Genuinely life-changing app. Nothing even remotely comes close to Welockin for blocking distractions across all my devices — Mac, iPhone, iPad, everything stays in sync.”",
      fr: "« Une appli qui change vraiment la vie. Rien ne s’approche de Welockin pour bloquer les distractions sur tous mes appareils : Mac, iPhone, iPad, tout reste synchronisé. »",
      es: "«Una app que de verdad te cambia la vida. Nada se acerca ni de lejos a Welockin para bloquear distracciones en todos mis dispositivos: Mac, iPhone, iPad, todo se mantiene sincronizado.»",
      de: "„Eine App, die wirklich das Leben verändert. Nichts kommt auch nur annähernd an Welockin heran, wenn es darum geht, Ablenkungen auf allen meinen Geräten zu blockieren: Mac, iPhone, iPad, alles bleibt synchron.“",
      "pt-BR": "“Um app que muda a vida de verdade. Nada chega nem perto do Welockin para bloquear distrações em todos os meus aparelhos: Mac, iPhone, iPad, tudo fica sincronizado.”",
      hi: "“सच में ज़िंदगी बदल देने वाला ऐप। मेरे सारे डिवाइस पर ध्यान भटकाने वाली चीज़ें रोकने में Welockin के आसपास भी कुछ नहीं है — Mac, iPhone, iPad, सब कुछ सिंक में रहता है।”",
    },
    role: {
      en: "MSc in Management",
      fr: "Master en Management",
      es: "Máster en Gestión",
      de: "Master in Management",
      "pt-BR": "Mestrado em Administração",
      hi: "मैनेजमेंट में स्नातकोत्तर",
    },
  },
  {
    who: "Karim Assaf",
    where: "ETH Zürich",
    photo: "/images/blocker/people/karim-assaf.webp",
    logo: "/images/blocker/logos/07_ETH.webp",
    text: {
      en: "“As a student, I find Welockin to be a game changer, and I have been using it for a few years. It blocks distracting websites and apps effectively, and it has made my study time far more efficient. I recommend it to anyone looking to get the most out of their focus.”",
      fr: "« Pour un étudiant, Welockin change tout, et je l’utilise depuis plusieurs années. Il bloque efficacement les sites et les applis qui me distraient, et mes heures de travail sont bien plus productives. Je le recommande à tous ceux qui veulent tirer le maximum de leur concentration. »",
      es: "«Para un estudiante, Welockin lo cambia todo, y llevo usándolo varios años. Bloquea de forma eficaz las webs y las apps que me distraen, y mis horas de estudio son mucho más productivas. Se lo recomiendo a cualquiera que quiera sacar el máximo de su concentración.»",
      de: "„Im Studium war Welockin für mich ein echter Wendepunkt, und ich nutze es seit mehreren Jahren. Es blockiert ablenkende Websites und Apps zuverlässig, und meine Lernzeit ist dadurch deutlich effizienter geworden. Ich empfehle es jedem, der das Maximum aus seiner Konzentration holen will.“",
      "pt-BR": "“Para um estudante, o Welockin muda o jogo, e eu uso ele há alguns anos. Ele bloqueia com eficácia os sites e apps que me distraem, e as minhas horas de estudo ficaram muito mais produtivas. Recomendo para qualquer pessoa que queira tirar o máximo da própria concentração.”",
      hi: "“एक छात्र के लिए Welockin सब बदल देता है, और मैं इसे कई साल से इस्तेमाल कर रहा हूँ। यह ध्यान भटकाने वाली वेबसाइटें और ऐप्स असरदार तरीके से ब्लॉक करता है, और मेरा पढ़ाई का समय कहीं ज़्यादा उपयोगी हो गया है। जो भी अपनी एकाग्रता का पूरा फ़ायदा उठाना चाहता है, उसे मैं यह ज़रूर कहूँगा।”",
    },
    role: {
      en: "MSc Nuclear Engineering",
      fr: "Master en Génie Nucléaire",
      es: "Máster en Ingeniería Nuclear",
      de: "Master Nukleartechnik",
      "pt-BR": "Mestrado em Engenharia Nuclear",
      hi: "न्यूक्लियर इंजीनियरिंग में स्नातकोत्तर",
    },
  },
  {
    who: "Hedi Fourati",
    where: "École Polytechnique",
    photo: "/images/blocker/people/hedi-fourati.webp",
    logo: "/images/blocker/logos/polytechnique.webp",
    text: {
      en: "“Amazing security. The locks are extremely difficult to bypass. It changed the way I focus, forever. 10/10.”",
      fr: "« Une sécurité impressionnante. Les verrous sont extrêmement difficiles à contourner. Ça a changé ma façon de me concentrer, définitivement. 10/10. »",
      es: "«Una seguridad impresionante. Los bloqueos son extremadamente difíciles de saltarse. Cambió mi forma de concentrarme, para siempre. 10/10.»",
      de: "„Beeindruckende Sicherheit. Die Sperren sind extrem schwer zu umgehen. Das hat meine Konzentration für immer verändert. 10/10.“",
      "pt-BR": "“Segurança impressionante. As travas são extremamente difíceis de burlar. Mudou o meu jeito de me concentrar, para sempre. 10/10.”",
      hi: "“कमाल की सुरक्षा। लॉक तोड़ना बेहद मुश्किल है। इसने मेरे ध्यान लगाने का तरीका हमेशा के लिए बदल दिया। 10/10।”",
    },
    role: {
      en: "Bachelor of Science",
      fr: "Programme Bachelor",
      es: "Programa Bachelor",
      de: "Bachelorstudium",
      "pt-BR": "Programa Bachelor",
      hi: "बैचलर प्रोग्राम",
    },
  },
  {
    who: "Selim Haouala",
    where: "EPFL",
    photo: "/images/blocker/people/selim-haouala.webp",
    logo: "/images/blocker/logos/22_EPFL.webp",
    text: {
      en: "“The best blocker for PC. I needed to cut my screen time, and after a bit of research I bit the bullet on Welockin. Best decision I have made: it blocks the websites that waste my time, and it locks my phone at the same time.”",
      fr: "« Le meilleur bloqueur sur PC. Je devais réduire mon temps d’écran, et après quelques recherches je me suis lancé sur Welockin. La meilleure décision que j’aie prise : il bloque les sites qui me font perdre mon temps, et il verrouille mon téléphone en même temps. »",
      es: "«El mejor bloqueador para PC. Necesitaba reducir mi tiempo de pantalla y, tras investigar un poco, me lancé con Welockin. La mejor decisión que he tomado: bloquea las webs que me hacen perder el tiempo y bloquea el móvil a la vez.»",
      de: "„Der beste Blocker für den PC. Ich musste meine Bildschirmzeit reduzieren, habe kurz recherchiert und mich für Welockin entschieden. Die beste Entscheidung überhaupt: Er blockiert die Seiten, die mir die Zeit stehlen, und sperrt gleichzeitig mein Handy.“",
      "pt-BR": "“O melhor bloqueador para PC. Eu precisava reduzir meu tempo de tela e, depois de pesquisar um pouco, resolvi encarar o Welockin. Melhor decisão que já tomei: ele bloqueia os sites que me fazem perder tempo e trava o celular ao mesmo tempo.”",
      hi: "“PC के लिए सबसे बढ़िया ब्लॉकर। मुझे अपना स्क्रीन टाइम कम करना था, और थोड़ी खोजबीन के बाद मैंने Welockin पर दाँव लगाया। यह मेरा सबसे अच्छा फ़ैसला रहा: यह मेरा समय बर्बाद करने वाली साइटें ब्लॉक करता है, और साथ ही मेरा फ़ोन भी लॉक कर देता है।”",
    },
    role: {
      en: "BSc Computer Science",
      fr: "Bachelor en informatique",
      es: "Grado en Informática",
      de: "Bachelor Informatik",
      "pt-BR": "Bacharelado em Computação",
      hi: "कंप्यूटर साइंस में स्नातक",
    },
  },
  {
    who: "Selim Msallem",
    where: "HEC Montréal",
    photo: "/images/blocker/people/selim-msallem.webp",
    logo: "/images/blocker/logos/27_HECMONTREAL.png",
    text: {
      en: "“This app is the primary reason I can get good grades. I have real issues with dopamine addiction and I struggle to stop playing games or watching videos once I start. I wholeheartedly recommend Welockin if you need help focusing or want to take back control of a habit.”",
      fr: "« Cette appli est la raison principale pour laquelle j’ai de bonnes notes. J’ai un vrai problème d’addiction à la dopamine et j’ai beaucoup de mal à m’arrêter une fois que je commence à jouer ou à regarder des vidéos. Je recommande Welockin de tout cœur si vous avez besoin d’aide pour vous concentrer ou reprendre le contrôle d’une habitude. »",
      es: "«Esta app es la razón principal de que saque buenas notas. Tengo un problema real de adicción a la dopamina y me cuesta muchísimo parar cuando empiezo a jugar o a ver vídeos. Recomiendo Welockin de todo corazón si necesitas ayuda para concentrarte o quieres recuperar el control de un hábito.»",
      de: "„Diese App ist der Hauptgrund, warum ich gute Noten schreibe. Ich habe echte Probleme mit Dopaminsucht und schaffe es kaum aufzuhören, wenn ich einmal anfange zu spielen oder Videos zu schauen. Ich empfehle Welockin von ganzem Herzen, wenn du Hilfe beim Fokussieren brauchst oder eine Gewohnheit wieder in den Griff bekommen willst.“",
      "pt-BR": "“Esse app é o principal motivo de eu conseguir boas notas. Tenho um problema sério de vício em dopamina e sofro para parar quando começo a jogar ou a ver vídeos. Recomendo o Welockin de coração se você precisa de ajuda para focar ou quer retomar o controle de um hábito.”",
      hi: "“मेरे अच्छे नंबर आने की सबसे बड़ी वजह यही ऐप है। मुझे डोपामाइन की लत की गंभीर समस्या है और एक बार गेम खेलना या वीडियो देखना शुरू कर दूँ तो रुक नहीं पाता। अगर आपको ध्यान लगाने में मदद चाहिए या किसी आदत पर काबू पाना है, तो मैं दिल से Welockin की सलाह दूँगा।”",
    },
    role: {
      en: "BBA",
      fr: "BBA",
      es: "BBA",
      de: "BBA",
      "pt-BR": "BBA",
      hi: "बीबीए",
    },
  },
  {
    who: "Skander el Gharbi",
    where: "Lycée du Parc",
    photo: "/images/blocker/people/skander-gharbi.webp",
    logo: "/images/blocker/logos/30_LyceeParc.png",
    text: {
      en: "“I would never have passed my year without this app. I have been using it for about a year and I have nothing bad to say about it.”",
      fr: "« Je n’aurais jamais eu mon année sans cette application. Je l’utilise depuis environ un an et je n’ai rien à lui reprocher. »",
      es: "«Nunca habría aprobado el curso sin esta aplicación. Llevo usándola casi un año y no tengo nada malo que decir de ella.»",
      de: "„Ohne diese App hätte ich mein Jahr nie bestanden. Ich nutze sie seit ungefähr einem Jahr und habe nichts Schlechtes darüber zu sagen.“",
      "pt-BR": "“Eu nunca teria passado de ano sem esse aplicativo. Uso ele há mais ou menos um ano e não tenho nada de ruim para falar.”",
      hi: "“इस ऐप के बिना मैं अपना साल कभी पास नहीं कर पाता। मैं इसे करीब एक साल से इस्तेमाल कर रहा हूँ और इसमें बुरा कहने लायक़ कुछ भी नहीं है।”",
    },
    role: {
      en: "Prepa ECG",
      fr: "Prépa ECG",
      es: "Preparatoria ECG",
      de: "Vorbereitungsklasse ECG",
      "pt-BR": "Curso preparatório ECG",
      hi: "प्रेपा ECG",
    },
  },
  {
    who: "Omar Bouzguenda",
    where: "ESSEC Business School",
    photo: "/images/blocker/people/omar-bouzguenda.webp",
    logo: "/images/blocker/logos/29_ESSEC.webp",
    text: {
      en: "“Perfect if you need help to finally get productive on your computer. Not a miracle — I am very creative when I procrastinate — but at least you cannot wander aimlessly on social media any more.”",
      fr: "« Parfait pour ceux qui ont besoin d’aide pour enfin être productifs sur leur ordinateur. Pas un miracle — je suis très créatif quand je procrastine — mais au moins on ne peut plus errer sans but sur les réseaux sociaux. »",
      es: "«Perfecto para quien necesita ayuda para por fin ser productivo en el ordenador. No es un milagro —soy muy creativo cuando procrastino—, pero al menos ya no puedes vagar sin rumbo por las redes sociales.»",
      de: "„Perfekt für alle, die endlich Hilfe brauchen, um am Computer produktiv zu werden. Kein Wunder — ich bin sehr kreativ, wenn ich prokrastiniere — aber wenigstens kann man nicht mehr ziellos durch die sozialen Netzwerke treiben.“",
      "pt-BR": "“Perfeito para quem precisa de ajuda para finalmente render no computador. Não é milagre — sou muito criativo quando procrastino — mas pelo menos dá para não ficar vagando sem rumo nas redes sociais.”",
      hi: "“उनके लिए बिल्कुल सही जिन्हें आख़िरकार कंप्यूटर पर काम करने के लिए मदद चाहिए। यह कोई चमत्कार नहीं है — टालमटोल करने में मैं बहुत रचनात्मक हूँ — लेकिन कम से कम अब सोशल मीडिया पर बेमतलब भटका नहीं जा सकता।”",
    },
    role: {
      en: "BBA",
      fr: "BBA",
      es: "BBA",
      de: "BBA",
      "pt-BR": "BBA",
      hi: "बीबीए",
    },
  },
];
