"use strict";
/* Páginas legales: política de privacidad, términos y condiciones, y botón de arrepentimiento y de baja.
   El texto completo está escrito en cada idioma (no pasa por el diccionario de traducción). */

const LEGAL_UPDATED = { es: "17 de noviembre de 2026", en: "November 17, 2026", pt: "17 de novembro de 2026" };
const LEGAL_MAIL = "diablomastermix@gmail.com";
const CONSUMER_URL = "https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario";

const LEGAL = {
  /* ------------------------------------------------------------------ privacidad */
  privacidad: {
    es: { title: "Política de privacidad", lead: "Qué datos guarda Diablo Master Mix, para qué los usa y cómo puedes pedir que se corrijan o se borren.", sections: [
      ["Responsable", [`Diablo Master Mix es un producto de Puma Code, estudio de software con sede en Mendoza, Argentina. Para cualquier consulta sobre tus datos escribe a <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a>.`]],
      ["Qué datos guardamos", [{ ul: [
        "Cuenta: nombre, email, contraseña (guardada cifrada, nunca en texto), foto opcional e idioma.",
        "Banda: nombre, foto, integrantes y el rol de cada uno.",
        "Contenido que sube la banda: audios, versiones, letras, portadas, álbumes, notas y fechas del calendario.",
        "Perfil de músico (opcional): instrumentos, estilos, ciudad, país, biografía, equipamiento, medio de contacto y si estás disponible para tocar.",
        "Pagos: plan, estado de la suscripción e identificadores del cobro. Los datos de tu tarjeta los procesa Mercado Pago o Polar; no llegan a Diablo Master Mix.",
        "Mensajes que envías por el formulario de contacto o el chat del sitio.",
        "Datos técnicos: dirección IP y registros del servidor, usados para seguridad y para limitar abusos.",
      ] }]],
      ["Para qué los usamos", ["Para prestar el servicio (guardar y reproducir tus audios, masterizar, analizar mezclas, detectar letras, armar el paquete de lanzamiento), cobrar la suscripción, enviarte avisos por mail o notificaciones, darte soporte y proteger la plataforma. No vendemos tus datos, no mostramos publicidad y no armamos perfiles para terceros."]],
      ["Quién puede ver tu contenido", [{ ul: [
        "Los audios, letras y demás material de una banda solo los ven sus integrantes.",
        "El panel de administración de Diablo Master Mix muestra datos de cuenta, suscripción y cantidades de uso; no permite escuchar ni descargar el material de las bandas.",
        "Banco de músicos: si marcas tu perfil como disponible, lo ven los administradores de las bandas. Si te postulas a una búsqueda, la banda ve tu perfil y tu email. Las búsquedas que publica una banda las ven los músicos registrados.",
      ] }]],
      ["Proveedores que usamos", [{ ul: [
        "Cloudflare: red de entrega del sitio y verificación anti-robots.",
        "OpenAI: genera los textos del asistente a partir de las mediciones del análisis (el audio nunca se envía), responde el chat del sitio y crea portadas con IA a partir de la descripción y, si la eliges, de la foto que subas para eso.",
        "Mercado Pago (Argentina) y Polar (resto del mundo): cobro de suscripciones.",
        "Nuestro proveedor de correo: envío de mails de la plataforma.",
        "Los servicios de notificaciones de tu navegador, si activas los avisos.",
      ] }, "La detección de letras y el procesamiento del audio se hacen en nuestro propio servidor. Algunos de estos proveedores procesan datos fuera de Argentina; solo compartimos lo necesario para cada función."]],
      ["Cuánto tiempo guardamos los datos", [{ ul: [
        "Mientras tu cuenta o tu banda estén activas.",
        "Las grabaciones completas de los ensayos se borran a los 30 días; se conservan los temas que la banda guardó.",
        "Si una banda se da de baja, o la prueba gratis termina sin pago, todos sus datos se eliminan a las 48 horas.",
        "Una cuenta de músico se puede eliminar en cualquier momento desde Tu cuenta.",
        "Los datos de facturación que la ley obligue a conservar se guardan durante el plazo legal.",
      ] }]],
      ["Cookies y almacenamiento del navegador", ["No usamos cookies de publicidad ni de analítica. En tu navegador guardamos la sesión, el idioma y algunas preferencias para que la plataforma funcione. Cloudflare puede usar cookies técnicas para la seguridad del sitio."]],
      ["Seguridad", ["Las contraseñas se guardan cifradas, toda la comunicación viaja por HTTPS, los enlaces de audio vencen a las pocas horas y cada banda solo accede a su propio material. Ningún sistema es infalible: si detectamos un incidente que afecte tus datos, te avisaremos."]],
      ["Tus derechos", [`Puedes pedir acceso a tus datos, corregirlos, actualizarlos o eliminarlos escribiendo a <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a> desde el email de tu cuenta. Responderemos los pedidos de acceso dentro de los 10 días corridos y los de rectificación o supresión dentro de los 5 días hábiles, como establece la Ley 25.326. El acceso es gratuito en intervalos no menores a seis meses, salvo que acredites un interés legítimo.`,
        "Si vives en la Unión Europea o el Reino Unido, también puedes oponerte al tratamiento, pedir la portabilidad de tus datos y presentar un reclamo ante tu autoridad de protección de datos.",
        "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales."]],
      ["Menores de edad", ["Para crear una cuenta debes tener al menos 13 años. Si eres menor de 18, necesitas la autorización de tus padres o tutores. Las suscripciones solo las puede contratar una persona mayor de edad."]],
      ["Cambios en esta política", ["Si cambiamos esta política, publicaremos la nueva versión con su fecha. Si el cambio es importante, lo avisaremos por email."]],
    ] },
    en: { title: "Privacy policy", lead: "What data Diablo Master Mix keeps, what it is used for and how you can ask for it to be corrected or deleted.", sections: [
      ["Who is responsible", [`Diablo Master Mix is a product of Puma Code, a software studio based in Mendoza, Argentina. For any question about your data, write to <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a>.`]],
      ["What data we keep", [{ ul: [
        "Account: name, email, password (stored encrypted, never as plain text), optional photo and language.",
        "Band: name, photo, members and each member's role.",
        "Content the band uploads: audio, versions, lyrics, covers, albums, notes and calendar dates.",
        "Musician profile (optional): instruments, styles, city, country, bio, gear, contact method and whether you are available to play.",
        "Payments: plan, subscription status and payment identifiers. Your card details are processed by Mercado Pago or Polar and never reach Diablo Master Mix.",
        "Messages you send through the contact form or the site chat.",
        "Technical data: IP address and server logs, used for security and to limit abuse.",
      ] }]],
      ["What we use it for", ["To provide the service (store and play your audio, master, analyse mixes, detect lyrics, build the release package), charge the subscription, send you emails or notifications, give you support and protect the platform. We do not sell your data, we do not show ads and we do not build profiles for third parties."]],
      ["Who can see your content", [{ ul: [
        "A band's audio, lyrics and other material can only be seen by its members.",
        "The Diablo Master Mix admin panel shows account, subscription and usage counts; it does not allow listening to or downloading any band's material.",
        "Musicians' bank: if you mark your profile as available, band admins can see it. If you apply to a search, the band sees your profile and email. Searches posted by a band are visible to registered musicians.",
      ] }]],
      ["Providers we use", [{ ul: [
        "Cloudflare: site delivery network and anti-bot verification.",
        "OpenAI: writes the assistant's notes from the analysis measurements (the audio is never sent), answers the site chat and creates AI covers from the description and, if you choose to, the photo you upload for it.",
        "Mercado Pago (Argentina) and Polar (rest of the world): subscription payments.",
        "Our email provider: sending the platform's emails.",
        "Your browser's notification services, if you turn on alerts.",
      ] }, "Lyrics detection and audio processing run on our own server. Some of these providers process data outside Argentina; we only share what each feature needs."]],
      ["How long we keep data", [{ ul: [
        "While your account or band is active.",
        "Full rehearsal recordings are deleted after 30 days; the songs the band saved are kept.",
        "If a band cancels, or the free trial ends without payment, all of its data is deleted after 48 hours.",
        "A musician account can be deleted at any time from Your account.",
        "Billing data that the law requires us to keep is stored for the legal period.",
      ] }]],
      ["Cookies and browser storage", ["We do not use advertising or analytics cookies. Your browser stores your session, language and a few preferences so the platform works. Cloudflare may use technical cookies for site security."]],
      ["Security", ["Passwords are stored encrypted, all traffic uses HTTPS, audio links expire after a few hours and each band can only access its own material. No system is infallible: if we detect an incident affecting your data, we will let you know."]],
      ["Your rights", [`You can ask to access, correct, update or delete your data by writing to <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a> from your account email. We answer access requests within 10 calendar days and correction or deletion requests within 5 business days, as set by Argentine Law 25.326. Access is free at intervals of no less than six months, unless you show a legitimate interest.`,
        "If you live in the European Union or the United Kingdom, you can also object to processing, ask for data portability and lodge a complaint with your data protection authority.",
        "The Argentine Agency for Access to Public Information (AAIP), as the supervisory authority of Law 25.326, handles complaints from anyone whose rights are affected by a breach of personal data protection rules."]],
      ["Minors", ["You must be at least 13 to create an account. If you are under 18, you need permission from your parents or guardians. Subscriptions can only be purchased by an adult."]],
      ["Changes to this policy", ["If we change this policy, we will publish the new version with its date. If the change is significant, we will let you know by email."]],
    ] },
    pt: { title: "Política de privacidade", lead: "Quais dados o Diablo Master Mix guarda, para que os usa e como você pode pedir que sejam corrigidos ou apagados.", sections: [
      ["Responsável", [`O Diablo Master Mix é um produto da Puma Code, estúdio de software com sede em Mendoza, Argentina. Para qualquer dúvida sobre seus dados, escreva para <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a>.`]],
      ["Quais dados guardamos", [{ ul: [
        "Conta: nome, e-mail, senha (guardada criptografada, nunca em texto), foto opcional e idioma.",
        "Banda: nome, foto, integrantes e o papel de cada um.",
        "Conteúdo enviado pela banda: áudios, versões, letras, capas, álbuns, notas e datas do calendário.",
        "Perfil de músico (opcional): instrumentos, estilos, cidade, país, biografia, equipamento, meio de contato e se você está disponível para tocar.",
        "Pagamentos: plano, status da assinatura e identificadores da cobrança. Os dados do seu cartão são processados pelo Mercado Pago ou pela Polar e não chegam ao Diablo Master Mix.",
        "Mensagens enviadas pelo formulário de contato ou pelo chat do site.",
        "Dados técnicos: endereço IP e registros do servidor, usados para segurança e para limitar abusos.",
      ] }]],
      ["Para que usamos", ["Para prestar o serviço (guardar e reproduzir seus áudios, masterizar, analisar mixagens, detectar letras, montar o pacote de lançamento), cobrar a assinatura, enviar avisos por e-mail ou notificações, dar suporte e proteger a plataforma. Não vendemos seus dados, não exibimos publicidade e não criamos perfis para terceiros."]],
      ["Quem pode ver seu conteúdo", [{ ul: [
        "Os áudios, letras e demais materiais de uma banda só são vistos pelos seus integrantes.",
        "O painel de administração do Diablo Master Mix mostra dados de conta, assinatura e quantidades de uso; não permite ouvir nem baixar o material das bandas.",
        "Banco de músicos: se você marcar seu perfil como disponível, os administradores das bandas podem vê-lo. Se você se candidatar a uma busca, a banda vê seu perfil e seu e-mail. As buscas publicadas por uma banda são vistas pelos músicos cadastrados.",
      ] }]],
      ["Fornecedores que usamos", [{ ul: [
        "Cloudflare: rede de entrega do site e verificação anti-robôs.",
        "OpenAI: escreve os textos do assistente a partir das medições da análise (o áudio nunca é enviado), responde o chat do site e cria capas com IA a partir da descrição e, se você escolher, da foto enviada para isso.",
        "Mercado Pago (Argentina) e Polar (resto do mundo): cobrança das assinaturas.",
        "Nosso provedor de e-mail: envio dos e-mails da plataforma.",
        "Os serviços de notificações do seu navegador, se você ativar os avisos.",
      ] }, "A detecção de letras e o processamento do áudio são feitos no nosso próprio servidor. Alguns desses fornecedores processam dados fora da Argentina; compartilhamos apenas o necessário para cada função."]],
      ["Por quanto tempo guardamos os dados", [{ ul: [
        "Enquanto sua conta ou sua banda estiverem ativas.",
        "As gravações completas dos ensaios são apagadas após 30 dias; as músicas que a banda salvou são mantidas.",
        "Se uma banda cancelar, ou o teste grátis terminar sem pagamento, todos os seus dados são apagados após 48 horas.",
        "Uma conta de músico pode ser excluída a qualquer momento em Sua conta.",
        "Os dados de faturamento que a lei exige guardar ficam pelo prazo legal.",
      ] }]],
      ["Cookies e armazenamento do navegador", ["Não usamos cookies de publicidade nem de análise. No seu navegador guardamos a sessão, o idioma e algumas preferências para a plataforma funcionar. A Cloudflare pode usar cookies técnicos para a segurança do site."]],
      ["Segurança", ["As senhas são guardadas criptografadas, toda a comunicação usa HTTPS, os links de áudio expiram em poucas horas e cada banda só acessa o próprio material. Nenhum sistema é infalível: se detectarmos um incidente que afete seus dados, avisaremos você."]],
      ["Seus direitos", [`Você pode pedir acesso aos seus dados, corrigi-los, atualizá-los ou excluí-los escrevendo para <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a> a partir do e-mail da sua conta. Respondemos pedidos de acesso em até 10 dias corridos e de correção ou exclusão em até 5 dias úteis, conforme a Lei argentina 25.326. O acesso é gratuito em intervalos não inferiores a seis meses, salvo interesse legítimo comprovado.`,
        "Se você mora no Brasil, na União Europeia ou no Reino Unido, também pode se opor ao tratamento, pedir a portabilidade dos seus dados e apresentar reclamação à sua autoridade de proteção de dados.",
        "A Agência de Acesso à Informação Pública (AAIP) da Argentina, como órgão de controle da Lei 25.326, atende denúncias e reclamações de quem for afetado em seus direitos pelo descumprimento das normas de proteção de dados pessoais."]],
      ["Menores de idade", ["Para criar uma conta você precisa ter pelo menos 13 anos. Se tiver menos de 18, precisa da autorização dos seus pais ou responsáveis. As assinaturas só podem ser contratadas por uma pessoa maior de idade."]],
      ["Mudanças nesta política", ["Se mudarmos esta política, publicaremos a nova versão com a data. Se a mudança for importante, avisaremos por e-mail."]],
    ] },
  },

  /* ------------------------------------------------------------------ términos */
  terminos: {
    es: { title: "Términos y condiciones", lead: "Las reglas de uso de Diablo Master Mix. Al crear una cuenta o contratar un plan, las aceptas.", sections: [
      ["El servicio", ["Diablo Master Mix es una plataforma web de Puma Code para que las bandas graben ensayos, organicen su producción, masterizen sus temas, preparen sus letras y descarguen un paquete listo para publicar. Algunas funciones usan procesamiento automático o inteligencia artificial y sus resultados pueden variar."]],
      ["Cuentas", ["Los datos que cargues deben ser reales. Eres responsable de cuidar tu contraseña y de lo que se haga con tu cuenta. El administrador de cada banda decide quién la integra y puede sumar o quitar integrantes."]],
      ["Planes, prueba y pagos", [{ ul: [
        "La suscripción es mensual, por banda, y se renueva sola hasta que la canceles. En Argentina se cobra en pesos con Mercado Pago; en el resto del mundo, en dólares con Polar. El precio vigente se muestra antes de contratar.",
        "Las bandas nuevas pueden tener una prueba gratis, con topes de uso y sin descargas. Si al terminar la prueba no se paga, los datos de la banda se eliminan a las 48 horas.",
        "Si cambiamos el precio de un plan, lo avisaremos por email con anticipación, antes del cobro siguiente.",
      ] }]],
      ["Cancelación y arrepentimiento", [`Puedes cancelar cuando quieras desde la sección Plan de tu banda o con el <a href="#/arrepentimiento">botón de baja</a>. Al cancelar, todos los datos de la banda se eliminan a las 48 horas, así que descarga antes lo que quieras conservar. No se devuelven los períodos ya cobrados, salvo lo previsto por la ley.`,
        `Si contrataste desde Argentina, tienes derecho a revocar la contratación dentro de los 10 días corridos desde que la hiciste, sin costo ni responsabilidad, según el artículo 34 de la Ley 24.240 de Defensa del Consumidor. Puedes hacerlo con el <a href="#/arrepentimiento">botón de arrepentimiento</a>.`]],
      ["Tu contenido", ["Tus canciones, grabaciones, letras e imágenes son tuyas y de tu banda. Nos das permiso para guardarlas, procesarlas y reproducirlas solo para prestarte el servicio. Debes tener los derechos de todo lo que subes.",
        "Los masters generados en la plataforma incluyen en los datos del archivo el crédito “Masterizado con Diablo Master Mix”. Ese crédito no cambia quién es titular de la obra ni de la grabación."]],
      ["Uso aceptable", [{ ul: [
        "No subas material sobre el que no tengas derechos.",
        "No intentes acceder al material de otras bandas ni a sistemas que no te correspondan.",
        "No uses la plataforma para enviar spam, software malicioso ni contenido ilegal.",
        "No revendas ni compartas el acceso fuera de los integrantes de tu banda.",
      ] }]],
      ["Resultados automáticos", ["La detección de letras, el análisis de mezclas, los masters y las portadas con IA se generan de forma automática y pueden contener errores. Revísalos antes de publicar: lo que la banda publica es responsabilidad de la banda. Si usas una foto para crear una portada, debes tener permiso para usarla."]],
      ["Banco de músicos", ["Diablo Master Mix solo pone en contacto a bandas y músicos. No participa de los acuerdos entre ellos ni responde por audiciones, ensayos o relaciones de trabajo. Cuando una banda suma a un músico del banco puede recibir un descuento en su próximo cobro, en las condiciones que se informan en la plataforma."]],
      ["Marcas de terceros", ["Los nombres de distribuidoras, plataformas y programas que mencionamos (por ejemplo AMA del INAMU, RouteNote, DistroKid, CD Baby, Spotify, Apple Music o REAPER) son marcas de sus respectivos titulares. Diablo Master Mix no está afiliado a ellos ni cuenta con su respaldo, salvo que se indique expresamente. Publicar con un tercero se rige por sus propias condiciones.", "REAPER es una marca registrada de Cockos Incorporated, usada con permiso.", "Algunos enlaces a servicios de terceros son enlaces de referido (por ejemplo, el de RouteNote en la guía de Lanzamiento). Si te registrás con ellos, Diablo Master Mix puede recibir una comisión de ese tercero. No tiene ningún costo para vos ni reduce lo que cobrás, y no cambia la información de la guía: elegís la distribuidora que prefieras."]],
      ["Disponibilidad y responsabilidad", ["Trabajamos para que el servicio funcione siempre, pero puede haber interrupciones por mantenimiento o fallas. Guarda tus propias copias de los archivos importantes. En la medida en que la ley lo permita, nuestra responsabilidad total se limita a lo que pagaste en los últimos tres meses. Nada de estos términos limita los derechos que te da la Ley 24.240 de Defensa del Consumidor."]],
      ["Suspensión", ["Podemos suspender o cerrar cuentas que incumplan estos términos, con aviso previo salvo que haya riesgo para otras bandas o para la plataforma."]],
      ["Cambios", ["Podemos actualizar estos términos. Publicaremos la nueva versión con su fecha y, si el cambio es importante, lo avisaremos por email antes de que entre en vigencia."]],
      ["Ley aplicable y reclamos", [`Estos términos se rigen por las leyes de la República Argentina. Para cualquier reclamo escribe a <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a>. Si eres consumidor, puedes además presentar tu reclamo en la <a href="${CONSUMER_URL}" target="_blank" rel="noopener">Ventanilla Única Federal de Defensa del Consumidor</a> o ante los tribunales de tu domicilio.`]],
    ] },
    en: { title: "Terms and conditions", lead: "The rules for using Diablo Master Mix. By creating an account or subscribing to a plan, you accept them.", sections: [
      ["The service", ["Diablo Master Mix is a web platform by Puma Code that lets bands record rehearsals, organise their production, master their songs, prepare their lyrics and download a package ready to release. Some features use automatic processing or artificial intelligence and their results may vary."]],
      ["Accounts", ["The information you enter must be real. You are responsible for keeping your password safe and for what is done with your account. Each band's admin decides who is in the band and can add or remove members."]],
      ["Plans, trial and payments", [{ ul: [
        "The subscription is monthly, per band, and renews automatically until you cancel it. In Argentina it is charged in pesos through Mercado Pago; in the rest of the world, in US dollars through Polar. The current price is shown before you subscribe.",
        "New bands may get a free trial, with usage limits and no downloads. If the trial ends without payment, the band's data is deleted after 48 hours.",
        "If we change a plan's price, we will tell you by email in advance, before the next charge.",
      ] }]],
      ["Cancellation and withdrawal", [`You can cancel at any time from your band's Plan section or with the <a href="#/arrepentimiento">cancellation button</a>. When you cancel, all of the band's data is deleted after 48 hours, so download anything you want to keep first. Periods already charged are not refunded, except as provided by law.`,
        `If you subscribed from Argentina, you have the right to withdraw within 10 calendar days of subscribing, at no cost, under article 34 of Argentine Consumer Protection Law 24.240. You can do it with the <a href="#/arrepentimiento">withdrawal button</a>.`]],
      ["Your content", ["Your songs, recordings, lyrics and images belong to you and your band. You allow us to store, process and play them only to provide the service. You must hold the rights to everything you upload.",
        "Masters created on the platform include the credit “Mastered with Diablo Master Mix” in the file metadata. That credit does not change who owns the work or the recording."]],
      ["Acceptable use", [{ ul: [
        "Do not upload material you do not have the rights to.",
        "Do not try to access other bands' material or systems you are not allowed to use.",
        "Do not use the platform to send spam, malicious software or illegal content.",
        "Do not resell or share access outside your band's members.",
      ] }]],
      ["Automatic results", ["Lyrics detection, mix analysis, masters and AI covers are generated automatically and may contain errors. Review them before releasing: what the band publishes is the band's responsibility. If you use a photo to create a cover, you must have permission to use it."]],
      ["Musicians' bank", ["Diablo Master Mix only connects bands and musicians. It is not part of any agreement between them and is not responsible for auditions, rehearsals or working relationships. When a band adds a musician from the bank it may get a discount on its next charge, under the conditions shown on the platform."]],
      ["Third-party trademarks", ["The names of distributors, platforms and software we mention (for example AMA by INAMU, RouteNote, DistroKid, CD Baby, Spotify, Apple Music or REAPER) are trademarks of their respective owners. Diablo Master Mix is not affiliated with or endorsed by them unless expressly stated. Releasing through a third party is governed by its own terms.", "REAPER is a registered trademark of Cockos Incorporated, used with permission.", "Some links to third-party services are referral links (for example, the RouteNote link in the Release guide). If you sign up through them, Diablo Master Mix may receive a commission from that third party. It costs you nothing, does not reduce what you earn and does not change the information in the guide: you choose the distributor you prefer."]],
      ["Availability and liability", ["We work to keep the service running, but there may be interruptions for maintenance or failures. Keep your own copies of important files. To the extent permitted by law, our total liability is limited to what you paid in the last three months. Nothing in these terms limits your rights under applicable consumer protection law."]],
      ["Suspension", ["We may suspend or close accounts that breach these terms, with prior notice unless there is a risk to other bands or to the platform."]],
      ["Changes", ["We may update these terms. We will publish the new version with its date and, if the change is significant, let you know by email before it takes effect."]],
      ["Governing law and complaints", [`These terms are governed by the laws of the Argentine Republic. For any complaint, write to <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a>. If you are a consumer, you also keep the rights and channels for complaints that your country's law gives you.`]],
    ] },
    pt: { title: "Termos e condições", lead: "As regras de uso do Diablo Master Mix. Ao criar uma conta ou contratar um plano, você as aceita.", sections: [
      ["O serviço", ["O Diablo Master Mix é uma plataforma web da Puma Code para que as bandas gravem ensaios, organizem sua produção, masterizem suas músicas, preparem suas letras e baixem um pacote pronto para publicar. Algumas funções usam processamento automático ou inteligência artificial e seus resultados podem variar."]],
      ["Contas", ["Os dados que você cadastrar devem ser verdadeiros. Você é responsável por proteger sua senha e pelo que é feito com sua conta. O administrador de cada banda decide quem a integra e pode adicionar ou remover integrantes."]],
      ["Planos, teste e pagamentos", [{ ul: [
        "A assinatura é mensal, por banda, e se renova automaticamente até você cancelar. Na Argentina é cobrada em pesos pelo Mercado Pago; no resto do mundo, em dólares pela Polar. O preço vigente é mostrado antes da contratação.",
        "As bandas novas podem ter um teste grátis, com limites de uso e sem downloads. Se o teste terminar sem pagamento, os dados da banda são apagados após 48 horas.",
        "Se mudarmos o preço de um plano, avisaremos por e-mail com antecedência, antes da cobrança seguinte.",
      ] }]],
      ["Cancelamento e arrependimento", [`Você pode cancelar quando quiser na seção Plano da sua banda ou com o <a href="#/arrepentimiento">botão de cancelamento</a>. Ao cancelar, todos os dados da banda são apagados após 48 horas; baixe antes o que quiser guardar. Os períodos já cobrados não são reembolsados, salvo o previsto em lei.`,
        `Se você contratou da Argentina, tem direito de desistir em até 10 dias corridos da contratação, sem custo, conforme o artigo 34 da Lei argentina 24.240 de Defesa do Consumidor. Você pode fazer isso com o <a href="#/arrepentimiento">botão de arrependimento</a>.`]],
      ["Seu conteúdo", ["Suas músicas, gravações, letras e imagens são suas e da sua banda. Você nos autoriza a guardá-las, processá-las e reproduzi-las apenas para prestar o serviço. Você deve ter os direitos de tudo o que envia.",
        "Os masters gerados na plataforma incluem nos dados do arquivo o crédito “Masterizado com Diablo Master Mix”. Esse crédito não muda quem é titular da obra nem da gravação."]],
      ["Uso aceitável", [{ ul: [
        "Não envie material sobre o qual você não tenha direitos.",
        "Não tente acessar o material de outras bandas nem sistemas que não lhe correspondam.",
        "Não use a plataforma para enviar spam, software malicioso ou conteúdo ilegal.",
        "Não revenda nem compartilhe o acesso fora dos integrantes da sua banda.",
      ] }]],
      ["Resultados automáticos", ["A detecção de letras, a análise de mixagens, os masters e as capas com IA são gerados automaticamente e podem conter erros. Revise antes de publicar: o que a banda publica é responsabilidade da banda. Se você usar uma foto para criar uma capa, precisa ter permissão para usá-la."]],
      ["Banco de músicos", ["O Diablo Master Mix apenas conecta bandas e músicos. Não participa dos acordos entre eles nem responde por audições, ensaios ou relações de trabalho. Quando uma banda adiciona um músico do banco, pode receber um desconto na próxima cobrança, nas condições informadas na plataforma."]],
      ["Marcas de terceiros", ["Os nomes de distribuidoras, plataformas e programas que mencionamos (por exemplo AMA do INAMU, RouteNote, DistroKid, CD Baby, Spotify, Apple Music ou REAPER) são marcas de seus respectivos titulares. O Diablo Master Mix não é afiliado a eles nem tem seu endosso, salvo indicação expressa. Publicar com um terceiro segue as condições dele.", "REAPER é uma marca registrada da Cockos Incorporated, usada com permissão.", "Alguns links para serviços de terceiros são links de indicação (por exemplo, o da RouteNote no guia de Lançamento). Se você se cadastrar por eles, o Diablo Master Mix pode receber uma comissão desse terceiro. Não tem nenhum custo para você, não reduz o que você recebe e não muda as informações do guia: você escolhe a distribuidora que preferir."]],
      ["Disponibilidade e responsabilidade", ["Trabalhamos para que o serviço funcione sempre, mas pode haver interrupções por manutenção ou falhas. Guarde suas próprias cópias dos arquivos importantes. Na medida permitida pela lei, nossa responsabilidade total se limita ao que você pagou nos últimos três meses. Nada nestes termos limita os direitos que a lei de defesa do consumidor lhe garante."]],
      ["Suspensão", ["Podemos suspender ou encerrar contas que descumpram estes termos, com aviso prévio, salvo se houver risco para outras bandas ou para a plataforma."]],
      ["Mudanças", ["Podemos atualizar estes termos. Publicaremos a nova versão com a data e, se a mudança for importante, avisaremos por e-mail antes de entrar em vigor."]],
      ["Lei aplicável e reclamações", [`Estes termos são regidos pelas leis da República Argentina. Para qualquer reclamação, escreva para <a href="mailto:${LEGAL_MAIL}">${LEGAL_MAIL}</a>. Se você for consumidor, mantém os direitos e os canais de reclamação que a lei do seu país lhe garante.`]],
    ] },
  },
};

const LEGAL_UI = {
  es: { updated: "Última actualización", back: "Volver al inicio", other: { privacidad: "Ver términos y condiciones", terminos: "Ver política de privacidad" } },
  en: { updated: "Last updated", back: "Back to home", other: { privacidad: "See terms and conditions", terminos: "See privacy policy" } },
  pt: { updated: "Última atualização", back: "Voltar ao início", other: { privacidad: "Ver termos e condições", terminos: "Ver política de privacidade" } },
};

function legalLang() { return LEGAL_UI[I18N.lang] ? I18N.lang : "es"; }

function legalShell(inner) {
  return `<div class="lg-page" translate="no">
    <header class="lg-top"><a class="lg-brand" href="#/"><img src="/logo-mark.png" alt=""><span>diablomastermix.com.ar</span></a>${I18N.switcher("lg-lang")}</header>
    <main class="lg-main">${inner}</main>
    <footer class="lg-foot">${legalFooterLinks()}</footer></div>`;
}

function legalBlock(b) {
  if (typeof b === "string") return `<p>${b}</p>`;
  return `<ul>${b.ul.map((x) => `<li>${x}</li>`).join("")}</ul>`;
}

/* enlaces legales para el pie de la landing y de estas páginas */
function legalFooterLinks() {
  const L = { es: ["Privacidad", "Términos", "Botón de arrepentimiento", "Defensa de las y los consumidores. Para reclamos ingrese aquí"],
    en: ["Privacy", "Terms", "Withdrawal button", "Consumer protection (Argentina): file a complaint"],
    pt: ["Privacidade", "Termos", "Botão de arrependimento", "Defesa do consumidor (Argentina): registrar reclamação"] }[legalLang()];
  return `<nav class="lg-links" aria-label="Legal" translate="no"><a href="#/privacidad">${L[0]}</a><a href="#/terminos">${L[1]}</a><a href="#/arrepentimiento">${L[2]}</a><a href="${CONSUMER_URL}" target="_blank" rel="noopener">${L[3]}</a></nav>`;
}

function viewLegal(kind) {
  const lg = legalLang(), d = LEGAL[kind][lg], ui = LEGAL_UI[lg];
  setApp(legalShell(`
    <h1>${d.title}</h1>
    <p class="lg-lead">${d.lead}</p>
    <p class="lg-date">${ui.updated}: ${LEGAL_UPDATED[lg]}</p>
    ${d.sections.map(([t, body]) => `<section><h2>${t}</h2>${body.map(legalBlock).join("")}</section>`).join("")}
    <p class="lg-nav"><a href="#/${kind === "privacidad" ? "terminos" : "privacidad"}">${ui.other[kind]}</a> · <a href="#/">${ui.back}</a></p>`));
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ botón de arrepentimiento y de baja */
const WD_UI = {
  es: { title: "Botón de arrepentimiento y de baja", lead: "Desde aquí puedes revocar la contratación o pedir la baja del servicio sin necesidad de entrar a tu cuenta.",
    info: ["<b>Arrepentimiento:</b> si contrataste desde Argentina, puedes revocar la contratación dentro de los 10 días corridos desde que la hiciste, sin costo, según el artículo 34 de la Ley 24.240.",
      "<b>Baja:</b> puedes pedir la baja del servicio en cualquier momento. Si eres administrador de la banda, también puedes hacerlo desde la sección Plan. Al darse de baja, los datos de la banda se eliminan a las 48 horas.",
      "Al enviar la solicitud recibirás un código por email y te responderemos dentro de las 24 horas."],
    kind: "Qué quieres hacer", kinds: { arrepentimiento: "Arrepentimiento (revocar la contratación)", baja: "Baja del servicio" },
    name: "Tu nombre", email: "Email con el que contrataste", band: "Nombre de la banda", msg: "Comentarios (opcional)",
    send: "Enviar solicitud", ok: "Solicitud recibida", code: "Tu código de solicitud es", okp: "Te enviamos una copia por email. Guarda el código por cualquier consulta.",
    errName: "Indica tu nombre.", errMail: "Revisa el email.", errTs: "Marca la casilla “No soy un robot”." },
  en: { title: "Withdrawal and cancellation button", lead: "Here you can withdraw from your subscription or ask to cancel the service without logging in.",
    info: ["<b>Withdrawal:</b> if you subscribed from Argentina, you can withdraw within 10 calendar days of subscribing, at no cost, under article 34 of Argentine Law 24.240.",
      "<b>Cancellation:</b> you can ask to cancel the service at any time. If you are the band admin, you can also do it from the Plan section. When a band cancels, its data is deleted after 48 hours.",
      "Once you send the request you will get a code by email and we will reply within 24 hours."],
    kind: "What do you want to do", kinds: { arrepentimiento: "Withdrawal (revoke the subscription)", baja: "Cancel the service" },
    name: "Your name", email: "Email you subscribed with", band: "Band name", msg: "Comments (optional)",
    send: "Send request", ok: "Request received", code: "Your request code is", okp: "We sent you a copy by email. Keep the code for any follow-up.",
    errName: "Enter your name.", errMail: "Check the email.", errTs: "Tick the “I'm not a robot” box." },
  pt: { title: "Botão de arrependimento e de cancelamento", lead: "Aqui você pode desistir da contratação ou pedir o cancelamento do serviço sem entrar na sua conta.",
    info: ["<b>Arrependimento:</b> se você contratou da Argentina, pode desistir em até 10 dias corridos da contratação, sem custo, conforme o artigo 34 da Lei argentina 24.240.",
      "<b>Cancelamento:</b> você pode pedir o cancelamento do serviço a qualquer momento. Se for administrador da banda, também pode fazê-lo na seção Plano. Ao cancelar, os dados da banda são apagados após 48 horas.",
      "Ao enviar a solicitação você receberá um código por e-mail e responderemos em até 24 horas."],
    kind: "O que você quer fazer", kinds: { arrepentimiento: "Arrependimento (desistir da contratação)", baja: "Cancelar o serviço" },
    name: "Seu nome", email: "E-mail usado na contratação", band: "Nome da banda", msg: "Comentários (opcional)",
    send: "Enviar solicitação", ok: "Solicitação recebida", code: "O código da sua solicitação é", okp: "Enviamos uma cópia por e-mail. Guarde o código para qualquer consulta.",
    errName: "Informe seu nome.", errMail: "Confira o e-mail.", errTs: "Marque a caixa “Não sou um robô”." },
};

async function viewWithdrawal() {
  const cfg = await loadPublicConfig();
  const T = WD_UI[legalLang()];
  setApp(legalShell(`
    <h1>${T.title}</h1>
    <p class="lg-lead">${T.lead}</p>
    ${T.info.map((x) => `<p>${x}</p>`).join("")}
    <form id="wd" class="lg-form" novalidate>
      <fieldset class="lg-kind"><legend>${T.kind}</legend>
        ${Object.entries(T.kinds).map(([k, l], i) => `<label><input type="radio" name="wd-kind" value="${k}" ${i === 0 ? "checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>
      <div class="field"><label for="wd-name">${T.name}</label><input id="wd-name" type="text" maxlength="120" autocomplete="name" required></div>
      <div class="field"><label for="wd-email">${T.email}</label><input id="wd-email" type="email" maxlength="255" autocomplete="email" inputmode="email" required></div>
      <div class="field"><label for="wd-band">${T.band}</label><input id="wd-band" type="text" maxlength="120"></div>
      <div class="field"><label for="wd-msg">${T.msg}</label><textarea id="wd-msg" maxlength="2000"></textarea></div>
      <div class="hp" aria-hidden="true"><label>-<input id="wd-web" type="text" tabindex="-1" autocomplete="off"></label></div>
      ${cfg.turnstile_site_key ? `<div id="wd-ts" class="ts-box"></div>` : ""}
      <p class="status error hidden" id="wd-err" role="alert"></p>
      <button class="btn primary big" id="wd-go">${T.send}</button>
    </form>`));
  window.scrollTo(0, 0);
  let token = "", widget = null;
  const err = $("#wd-err"), bad = (t) => { err.textContent = t; err.classList.remove("hidden"); };
  if (cfg.turnstile_site_key) {
    loadTurnstile().then(() => {
      widget = window.turnstile.render("#wd-ts", { sitekey: cfg.turnstile_site_key, theme: "dark", language: tsLang(),
        callback: (t) => { token = t; }, "expired-callback": () => { token = ""; }, "error-callback": () => { token = ""; } });
    }).catch(() => {});
  }
  $("#wd").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    err.classList.add("hidden");
    const body = { kind: $("input[name=wd-kind]:checked").value, name: $("#wd-name").value.trim(), email: $("#wd-email").value.trim(),
      band: $("#wd-band").value.trim(), message: $("#wd-msg").value.trim(), website: $("#wd-web").value, turnstile_token: token };
    if (body.name.length < 2) return bad(T.errName);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return bad(T.errMail);
    if (cfg.turnstile_site_key && !token) return bad(T.errTs);
    await withBusy($("#wd-go"), async () => {
      try {
        const r = await api("/public/withdrawal", { method: "POST", json: body });
        $("#wd").outerHTML = `<div class="lg-ok" role="status"><h2>${T.ok}</h2><p>${T.code}</p><p class="lg-code">${esc(r.code || "")}</p><p>${T.okp}</p></div>`;
      } catch (e) {
        bad(e.message);
        if (widget !== null && window.turnstile) { window.turnstile.reset(widget); token = ""; }
      }
    });
  });
}

/* línea de aceptación para los formularios de alta */
function legalConsent() {
  return { es: `Al continuar aceptas los <a href="#/terminos" target="_blank">Términos y condiciones</a> y la <a href="#/privacidad" target="_blank">Política de privacidad</a>.`,
    en: `By continuing you accept the <a href="#/terminos" target="_blank">Terms and conditions</a> and the <a href="#/privacidad" target="_blank">Privacy policy</a>.`,
    pt: `Ao continuar você aceita os <a href="#/terminos" target="_blank">Termos e condições</a> e a <a href="#/privacidad" target="_blank">Política de privacidade</a>.` }[legalLang()];
}
