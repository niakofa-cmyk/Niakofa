import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const en = {
  nav: {
    map: "Map",
    browse: "Browse",
    helper_dashboard: "Dashboard",
    community: "Community",
    wallet: "Wallet",
    profile: "Profile",
    circles: "Circles",
    earnings: "Earnings",
    nearby: "Nearby",
    active_job: "Active Job",
    family: "Family",
  },
  common: {
    loading: "Loading…",
    error: "Something went wrong",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    submit: "Submit",
    confirm: "Confirm",
    back: "Back",
    retry: "Retry",
    alerts: "Alerts",
  },
  status: {
    open: "Open",
    claimed: "Claimed",
    en_route: "En Route",
    arrived: "Arrived",
    completed: "Completed",
    cancelled: "Cancelled",
    pay_it_forward_pending: "Pay It Forward Pending",
  },
  category: {
    groceries: "Groceries",
    transportation: "Transportation",
    errands: "Errands",
    home_repair: "Home Repair",
    medical: "Medical",
    emergency: "Emergency",
    moving_labor: "Moving & Labor",
    pet_care: "Pet Care",
    childcare: "Childcare",
    senior_care: "Senior Care",
    yard_work: "Yard Work",
    tutoring: "Tutoring",
    cleaning: "Cleaning",
    meal_prep: "Meal Prep",
    paperwork: "Paperwork Help",
    local_farm: "Local Farm",
    food_pantry: "Food Pantry",
    stock_shelves: "Stock Shelves",
    event_setup: "Event Setup",
    delivery_run: "Delivery Run",
    tech_support: "Tech Support",
    business_services: "Business Services",
    other: "Other",
  },
  urgency: {
    low: "Low",
    medium: "Medium",
    high: "High",
    emergency: "Emergency",
  },
  payment: {
    immediate: "Pay Now",
    pay_it_forward: "Pay It Forward",
    goodwill: "Goodwill",
  },
  request: {
    new: "New Request",
    claim: "Claim Request",
    enRoute: "Mark En Route",
    arrived: "Mark Arrived",
    complete: "Complete",
    tip: "Leave a Tip",
    sos: "SOS",
    title_label: "What do you need help with?",
    title_placeholder: "e.g. Grocery pickup from H-E-B",
    description_label: "Details (optional)",
    description_placeholder: "Describe what you need…",
    neighborhood_label: "Neighborhood",
    already_claimed: "Already claimed or not found",
    not_your_request: "You are not the assigned helper",
  },
  community: {
    leaderboard: "Leaderboard",
    helpers: "Helpers",
    resources: "Resources",
    stats: "Community Stats",
    open_requests: "Open Requests",
    completed_today: "Completed Today",
    helpers_online: "Helpers Online",
  },
  wallet: {
    title: "Wallet",
    balance: "Balance",
    benevolence: "Benevolence",
    pledges: "Pledges",
    scheduled: "Scheduled Payments",
    tip_helper: "Tip Your Helper",
    earnings: "Earnings",
    goodwill: "Goodwill Points",
  },
  profile: {
    title: "Profile",
    helper_mode: "Helper Mode",
    trust_score: "Trust Score",
    help_count: "Helps Given",
    edit: "Edit Profile",
    logout: "Log Out",
    language: "Language",
  },
  auth: {
    login: "Log In",
    register: "Create Account",
    email: "Email",
    password: "Password",
    name: "Full Name",
    email_taken: "Email already registered",
    wrong_password: "Incorrect password",
    no_account: "No account found with that email",
    password_setup_prompt: "Your account was created before passwords were required. Please set a password for security.",
    set_password: "Set Password",
  },
};

const es: typeof en = {
  nav: {
    map: "Mapa",
    browse: "Explorar",
    helper_dashboard: "Panel",
    community: "Comunidad",
    wallet: "Cartera",
    profile: "Perfil",
    circles: "Círculos",
    earnings: "Ganancias",
    nearby: "Cercanas",
    active_job: "Trabajo Activo",
  },
  common: {
    loading: "Cargando…",
    error: "Algo salió mal",
    save: "Guardar",
    cancel: "Cancelar",
    close: "Cerrar",
    submit: "Enviar",
    confirm: "Confirmar",
    back: "Atrás",
    retry: "Reintentar",
    alerts: "Alertas",
  },
  status: {
    open: "Abierto",
    claimed: "Reclamado",
    en_route: "En Camino",
    arrived: "Llegó",
    completed: "Completado",
    cancelled: "Cancelado",
    pay_it_forward_pending: "Pago Diferido Pendiente",
  },
  category: {
    groceries: "Víveres",
    transportation: "Transporte",
    errands: "Mandados",
    home_repair: "Reparaciones",
    medical: "Médico",
    emergency: "Emergencia",
    moving_labor: "Mudanza y Carga",
    pet_care: "Cuidado de Mascotas",
    childcare: "Cuidado Infantil",
    senior_care: "Cuidado de Mayores",
    yard_work: "Jardinería",
    tutoring: "Tutoría",
    cleaning: "Limpieza",
    meal_prep: "Preparación de Comidas",
    paperwork: "Ayuda con Trámites",
    local_farm: "Granja Local",
    food_pantry: "Despensa de Alimentos",
    stock_shelves: "Surtir Estantes",
    event_setup: "Montaje de Eventos",
    delivery_run: "Entregas",
    tech_support: "Soporte Técnico",
    business_services: "Servicios Empresariales",
    other: "Otro",
  },
  urgency: {
    low: "Bajo",
    medium: "Medio",
    high: "Alto",
    emergency: "Emergencia",
  },
  payment: {
    immediate: "Pago Inmediato",
    pay_it_forward: "Pago Diferido",
    goodwill: "Voluntariado",
  },
  request: {
    new: "Nueva Solicitud",
    claim: "Tomar Solicitud",
    enRoute: "Marcar En Camino",
    arrived: "Marcar Llegada",
    complete: "Completar",
    tip: "Dejar Propina",
    sos: "SOS",
    title_label: "¿Con qué necesitas ayuda?",
    title_placeholder: "Ej. Compras en H-E-B",
    description_label: "Detalles (opcional)",
    description_placeholder: "Describe lo que necesitas…",
    neighborhood_label: "Vecindario",
    already_claimed: "Ya reclamada o no encontrada",
    not_your_request: "No eres el ayudante asignado",
  },
  community: {
    leaderboard: "Clasificación",
    helpers: "Ayudantes",
    resources: "Recursos",
    stats: "Estadísticas",
    open_requests: "Solicitudes Abiertas",
    completed_today: "Completadas Hoy",
    helpers_online: "Ayudantes en Línea",
  },
  wallet: {
    title: "Cartera",
    balance: "Saldo",
    benevolence: "Benevolencia",
    pledges: "Compromisos",
    scheduled: "Pagos Programados",
    tip_helper: "Propina al Ayudante",
    earnings: "Ganancias",
    goodwill: "Puntos de Voluntariado",
  },
  profile: {
    title: "Perfil",
    helper_mode: "Modo Ayudante",
    trust_score: "Puntaje de Confianza",
    help_count: "Ayudas Dadas",
    edit: "Editar Perfil",
    logout: "Cerrar Sesión",
    language: "Idioma",
  },
  auth: {
    login: "Iniciar Sesión",
    register: "Crear Cuenta",
    email: "Correo",
    password: "Contraseña",
    name: "Nombre Completo",
    email_taken: "Correo ya registrado",
    wrong_password: "Contraseña incorrecta",
    no_account: "No se encontró cuenta con ese correo",
    password_setup_prompt: "Tu cuenta fue creada antes de que se requirieran contraseñas. Por favor establece una contraseña por seguridad.",
    set_password: "Establecer Contraseña",
  },
};

// ── Partial translation helper ────────────────────────────────────────────────
// Missing keys fall back to English via i18next fallbackLng: "en".
// Cast suppresses TS complaints about incomplete objects — runtime is fine.
type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K] };
function p(partial: DeepPartial<typeof en>): typeof en {
  return partial as typeof en;
}

// ── French (fr) — West/Central African diaspora, Paris, Brussels, Haiti, Québec
const fr = p({
  nav: { map: "Carte", helper_dashboard: "Tableau de bord", community: "Communauté", wallet: "Portefeuille", profile: "Profil" },
  common: { loading: "Chargement…", error: "Une erreur est survenue", save: "Enregistrer", cancel: "Annuler", close: "Fermer", submit: "Envoyer", confirm: "Confirmer", back: "Retour", retry: "Réessayer", alerts: "Alertes" },
  status: { open: "Ouvert", claimed: "Pris en charge", en_route: "En route", arrived: "Arrivé", completed: "Terminé", cancelled: "Annulé", pay_it_forward_pending: "Payer en avant — En attente" },
  request: { new: "Nouvelle demande", claim: "Prendre en charge", enRoute: "Marquer en route", arrived: "Marquer arrivé", complete: "Terminer", tip: "Laisser un pourboire", sos: "SOS", title_label: "De quoi avez-vous besoin ?", title_placeholder: "Ex. Courses au supermarché", description_label: "Détails (facultatif)", description_placeholder: "Décrivez ce dont vous avez besoin…", neighborhood_label: "Quartier", already_claimed: "Déjà pris en charge ou introuvable", not_your_request: "Vous n'êtes pas l'aide assignée" },
  profile: { title: "Profil", helper_mode: "Mode aide", trust_score: "Score de confiance", help_count: "Aides données", edit: "Modifier le profil", logout: "Se déconnecter", language: "Langue" },
  auth: { login: "Se connecter", register: "Créer un compte", email: "E-mail", password: "Mot de passe", name: "Nom complet", email_taken: "E-mail déjà utilisé", wrong_password: "Mot de passe incorrect", no_account: "Aucun compte avec cet e-mail", password_setup_prompt: "Votre compte a été créé avant que les mots de passe soient requis. Veuillez en définir un.", set_password: "Définir le mot de passe" },
});

// ── Portuguese (pt) — Brazil, Angola, Mozambique, Cape Verde, Portugal
const pt = p({
  nav: { map: "Mapa", helper_dashboard: "Painel", community: "Comunidade", wallet: "Carteira", profile: "Perfil" },
  common: { loading: "Carregando…", error: "Algo deu errado", save: "Salvar", cancel: "Cancelar", close: "Fechar", submit: "Enviar", confirm: "Confirmar", back: "Voltar", retry: "Tentar novamente", alerts: "Alertas" },
  status: { open: "Aberto", claimed: "Reivindicado", en_route: "A caminho", arrived: "Chegou", completed: "Concluído", cancelled: "Cancelado", pay_it_forward_pending: "Pagar em frente — Pendente" },
  request: { new: "Nova Solicitação", claim: "Aceitar Pedido", enRoute: "Marcar a Caminho", arrived: "Marcar Chegada", complete: "Concluir", tip: "Deixar Gorjeta", sos: "SOS", title_label: "De que você precisa de ajuda?", title_placeholder: "Ex. Compras no mercado", description_label: "Detalhes (opcional)", description_placeholder: "Descreva o que você precisa…", neighborhood_label: "Bairro", already_claimed: "Já aceito ou não encontrado", not_your_request: "Você não é o ajudante designado" },
  profile: { title: "Perfil", helper_mode: "Modo Ajudante", trust_score: "Pontuação de Confiança", help_count: "Ajudas Dadas", edit: "Editar Perfil", logout: "Sair", language: "Idioma" },
  auth: { login: "Entrar", register: "Criar Conta", email: "E-mail", password: "Senha", name: "Nome Completo", email_taken: "E-mail já cadastrado", wrong_password: "Senha incorreta", no_account: "Nenhuma conta com esse e-mail", password_setup_prompt: "Sua conta foi criada antes de as senhas serem necessárias. Defina uma senha por segurança.", set_password: "Definir Senha" },
});

// ── Swahili (sw) — East Africa: Kenya, Tanzania, Uganda, DRC, and diaspora
const sw = p({
  nav: { map: "Ramani", helper_dashboard: "Dashibodi", community: "Jamii", wallet: "Pochi", profile: "Wasifu" },
  common: { loading: "Inapakia…", error: "Hitilafu imetokea", save: "Hifadhi", cancel: "Ghairi", close: "Funga", submit: "Wasilisha", confirm: "Thibitisha", back: "Rudi", retry: "Jaribu tena", alerts: "Tahadhari" },
  status: { open: "Wazi", claimed: "Imechukuliwa", en_route: "Njiani", arrived: "Amefika", completed: "Imekamilika", cancelled: "Imefutwa", pay_it_forward_pending: "Lipa Mbele — Inasubiri" },
  request: { new: "Ombi Jipya", claim: "Chukua Ombi", enRoute: "Alama ya Njiani", arrived: "Alama ya Kufika", complete: "Kamilisha", tip: "Acha Ncha", sos: "SOS", title_label: "Unahitaji msaada gani?", title_placeholder: "Mf. Ununuzi wa mboga sokoni", description_label: "Maelezo (hiari)", description_placeholder: "Elezea unachohitaji…", neighborhood_label: "Mtaa", already_claimed: "Imechukuliwa au haipatikani", not_your_request: "Wewe si msaidizi aliyepewa" },
  profile: { title: "Wasifu", helper_mode: "Hali ya Msaidizi", trust_score: "Alama ya Uaminifu", help_count: "Msaada Uliotolewa", edit: "Hariri Wasifu", logout: "Toka", language: "Lugha" },
  auth: { login: "Ingia", register: "Fungua Akaunti", email: "Barua pepe", password: "Nenosiri", name: "Jina Kamili", email_taken: "Barua pepe tayari imesajiliwa", wrong_password: "Nenosiri si sahihi", no_account: "Akaunti haipatikani na barua pepe hiyo", password_setup_prompt: "Akaunti yako iliundwa kabla nenosiri hazikuhitajika. Tafadhali weka nenosiri kwa usalama.", set_password: "Weka Nenosiri" },
});

// ── Somali (so) — Minneapolis, Columbus, D.C., London, Mogadishu, Nairobi
const so = p({
  nav: { map: "Khariidada", helper_dashboard: "Dashboard", community: "Bulshada", wallet: "Boorsada", profile: "Profaylka" },
  common: { loading: "Waa la raraysaa…", error: "Khalad ayaa dhacay", save: "Keydi", cancel: "Jooji", close: "Xidh", submit: "Dir", confirm: "Xaqiiji", back: "Dib u noqo", retry: "Mar labaad isku day", alerts: "Digniinaha" },
  status: { open: "Furan", claimed: "La qaatay", en_route: "Wadada ku socda", arrived: "Yimid", completed: "Dhameystay", cancelled: "La joojiyay", pay_it_forward_pending: "Kahor u bixinta — Sugaysa" },
  request: { new: "Codsiga Cusub", claim: "Qaado Codsigu", enRoute: "Calaamad Wadada", arrived: "Calaamad Imaatinka", complete: "Dhamaystir", tip: "Ugu tag Abaal", sos: "SOS", title_label: "Maxaad u baahan tahay caawimo?", title_placeholder: "Tusaale: Raridda suuqa", description_label: "Faahfaahin (ikhtiyaari)", description_placeholder: "Sharax waxa aad u baahan tahay…", neighborhood_label: "Xaafadda", already_claimed: "Horay loo qaatay ama lama helin", not_your_request: "Adiga maahan kaaliyaha la magacaabay" },
  profile: { title: "Profaylka", helper_mode: "Qaabka Kaaliyaha", trust_score: "Dhibcaha Aaminaadda", help_count: "Caawimaad La Siiyay", edit: "Wax ka beddel Profaylka", logout: "Ka bax", language: "Luqadda" },
  auth: { login: "Gal", register: "Abuuro Koonto", email: "Emaylka", password: "Furaha sirta", name: "Magaca Buuxa", email_taken: "Emaylka hore ayaa isu diiwaangeliyay", wrong_password: "Furaha sirta waa khalad", no_account: "Koonto lama helin emaylkaas", password_setup_prompt: "Koontadaadu waxaa la sameeyay ka hor inta aanay furaha sirta loo baahnayn. Fadlan u sameeyso furaha.", set_password: "Dhig Furaha Sirta" },
});

// ── Amharic (am) — Ethiopia, Ethiopian diaspora (D.C., Dallas, Minneapolis, Houston)
const am = p({
  nav: { map: "ካርታ", helper_dashboard: "ዳሽቦርድ", community: "ማህበረሰብ", wallet: "ዋሌት", profile: "መገለጫ" },
  common: { loading: "በመጫን ላይ…", error: "ችግር ተፈጥሯል", save: "አስቀምጥ", cancel: "ሰርዝ", close: "ዝጋ", submit: "አስገባ", confirm: "አረጋግጥ", back: "ተመለስ", retry: "እንደገና ሞክር", alerts: "ማስጠንቀቂያዎች" },
  status: { open: "ክፍት", claimed: "ተወስዷል", en_route: "በጉዞ ላይ", arrived: "ደረሰ", completed: "ተጠናቋል", cancelled: "ተሰርዟል", pay_it_forward_pending: "ወደፊት ክፈል — በጥበቃ ላይ" },
  request: { new: "አዲስ ጥያቄ", claim: "ጥያቄ ተቀበል", enRoute: "ምልክት ያድርጉ እየሄዱ ነው", arrived: "ደርሻለሁ ምልክት አድርግ", complete: "ጨርስ", tip: "ጉርሻ ስጥ", sos: "SOS", title_label: "ምን እርዳታ ይፈልጋሉ?", title_placeholder: "ምሳሌ፡ ከገበያ ቅርጫቶችን አምጣ", description_label: "ዝርዝሮች (አማራጭ)", description_placeholder: "የሚፈልጉትን ይግለጹ…", neighborhood_label: "ሰፈር", already_claimed: "ቀደም ብሎ ተወስዷል ወይም አልተገኘም", not_your_request: "እርስዎ የተመደቡ ረዳት አይደሉም" },
  profile: { title: "መገለጫ", helper_mode: "የረዳት ሁኔታ", trust_score: "የመተማመን ነጥብ", help_count: "እርዳታ ተሰጥቷል", edit: "መገለጫ አርትዕ", logout: "ውጣ", language: "ቋንቋ" },
  auth: { login: "ግባ", register: "መለያ ፍጠር", email: "ኢሜይል", password: "የምስጢር ቃል", name: "ሙሉ ስም", email_taken: "ኢሜይል ቀደም ሲል ተመዝግቧል", wrong_password: "የምስጢር ቃል ትክክለኛ አይደለም", no_account: "ከዚህ ኢሜይል ጋር ምንም መለያ አልተገኘም", password_setup_prompt: "መለያዎ ከምስጢር ቃል ከመፈለጉ በፊት ተፈጥሯል። እባክዎ ለደህንነት ምስጢር ቃል ያዘጋጁ።", set_password: "ምስጢር ቃል አዘጋጅ" },
});

// ── Yoruba (yo) — Nigeria, Benin, diaspora in New York, London, Toronto
const yo = p({
  nav: { map: "Maapu", helper_dashboard: "Dashibodu", community: "Àwùjọ", wallet: "Àpamọ́wọ́", profile: "Àwòṣe" },
  common: { loading: "Ń gba àkọsílẹ̀…", error: "Àṣìṣe kan ṣẹlẹ̀", save: "Fipamọ́", cancel: "Fagilee", close: "Pa", submit: "Firanṣẹ́", confirm: "Jẹ́rìísí", back: "Padà", retry: "Tún gbìyànjú", alerts: "Ìkìlọ̀" },
  status: { open: "Ṣíṣí", claimed: "Ti gba", en_route: "Lọ́nà", arrived: "Ti dé", completed: "Ti parí", cancelled: "Ti fagi lé", pay_it_forward_pending: "Sanwó Siwájú — Dúró" },
  request: { new: "Ìbéèrè Tuntun", claim: "Gba Ìbéèrè", enRoute: "Samí Lọ́nà", arrived: "Samí Dé", complete: "Parí", tip: "Fi ẹ̀bùn sílẹ̀", sos: "SOS", title_label: "Kí ni o nílò ìrànlọ́wọ́ rẹ̀?", title_placeholder: "Fun apẹrẹ: Ọjà rira", description_label: "Ọ̀ràn (àṣàyàn)", description_placeholder: "Ṣàlàyé ohun tí o nílò…", neighborhood_label: "Àdúgbò", already_claimed: "Ti gbà tàbí kò sí", not_your_request: "Ìwọ kọ́ ní olùrànlọ́wọ́ tí a yàn" },
  profile: { title: "Àwòṣe", helper_mode: "Ọ̀nà Olùrànlọ́wọ́", trust_score: "Ìdánilójú Ìpele", help_count: "Ìrànlọ́wọ́ Ti Fi", edit: "Ṣàtúnṣe Àwòṣe", logout: "Jáde", language: "Èdè" },
  auth: { login: "Wọlé", register: "Ṣẹ̀dá Àkáǹtì", email: "Ímeèlì", password: "Ọ̀rọ̀ aṣínà", name: "Orúkọ Pípé", email_taken: "Ímeèlì ti forúkọsílẹ̀ tẹ́lẹ̀", wrong_password: "Ọ̀rọ̀ aṣínà kò tọ̀", no_account: "Kò sí àkáǹtì pẹ̀lú ímeèlì yẹn", password_setup_prompt: "A ṣẹ̀dá àkáǹtì rẹ ṣáájú kí a tó nílò ọ̀rọ̀ aṣínà. Jọ̀wọ́ ṣèdá ọ̀rọ̀ aṣínà fún ààbò.", set_password: "Ṣèdá Ọ̀rọ̀ Aṣínà" },
});

// ── Hausa (ha) — Northern Nigeria, Niger, northern diaspora
const ha = p({
  nav: { map: "Taswirar ƙasa", helper_dashboard: "Allon sarrafawa", community: "Al'umma", wallet: "Walat", profile: "Bayani" },
  common: { loading: "Ana loda…", error: "Wani abu ya faru", save: "Ajiye", cancel: "Soke", close: "Rufe", submit: "Aika", confirm: "Tabbatar", back: "Koma", retry: "Sake gwadawa", alerts: "Faɗakarwa" },
  status: { open: "Buɗewa", claimed: "An ɗauka", en_route: "Kan hanya", arrived: "Ya isa", completed: "An gama", cancelled: "An soke", pay_it_forward_pending: "Biya gaba — Jira" },
  request: { new: "Sabon Nema", claim: "Ɗauki Nema", enRoute: "Alama Kan Hanya", arrived: "Alama Ya Isa", complete: "Gama", tip: "Bar Kyauta", sos: "SOS", title_label: "Kana buƙatar taimako nawa?", title_placeholder: "Misali: Sayan kayan miya", description_label: "Bayanai (zaɓi)", description_placeholder: "Bayyana abin da kake bukata…", neighborhood_label: "Unguwa", already_claimed: "An riga an ɗauka ko ba a samu ba", not_your_request: "Kai ba mai taimako da aka nada ba ne" },
  profile: { title: "Bayani", helper_mode: "Yanayin Mai Taimako", trust_score: "Maki Aminci", help_count: "Taimako Da Aka Yi", edit: "Gyara Bayani", logout: "Fita", language: "Harshe" },
  auth: { login: "Shiga", register: "Ƙirƙiri Asusu", email: "Imel", password: "Kalmar wucewa", name: "Sunan cikakke", email_taken: "Imel an riga an yi rajista", wrong_password: "Kalmar wucewa ba daidai ba ce", no_account: "Ba a samu asusu da wannan imel ba", password_setup_prompt: "An ƙirƙiri asusu ɗinka kafin a buƙaci kalmomin wucewa. Don Allah saita kalmar wucewa don aminci.", set_password: "Saita Kalmar Wucewa" },
});

// ── Igbo (ig) — Southeast Nigeria, Igbo diaspora worldwide
const ig = p({
  nav: { map: "Ebe", helper_dashboard: "Dọọbọọdụ", community: "Obodo", wallet: "Akpa ego", profile: "Ihe gbasara gị" },
  common: { loading: "Na-ebu…", error: "Ihe mmejọ mere", save: "Chekwaa", cancel: "Kagbuo", close: "Mechie", submit: "Zipu", confirm: "Kwenye", back: "Laghachi", retry: "Nwaa ọzọ", alerts: "Ọkwa" },
  status: { open: "Mepere", claimed: "E were ya", en_route: "Ọ dị n'ụzọ", arrived: "Eruola", completed: "Mechara", cancelled: "Kagbuola", pay_it_forward_pending: "Kwụọ Ego Tupu — Na-atọ ọnụ" },
  request: { new: "Arịọ Ọhụrụ", claim: "Were Arịọ", enRoute: "Akara Ọ Dị n'Ụzọ", arrived: "Akara Eruola", complete: "Mechaa", tip: "Hapụ Onyinye", sos: "SOS", title_label: "Ị chọrọ enyemaka gịnị?", title_placeholder: "Ihe atụ: Ịzụ ahịa", description_label: "Nkọwa (ọ dịghị mkpa)", description_placeholder: "Kọwaa ihe ị chọrọ…", neighborhood_label: "Mpaghara", already_claimed: "E were ya eruo ya ma ọ bụ ahụghị ya", not_your_request: "Ị bụghị onye nwere enyemaka a" },
  profile: { title: "Ihe gbasara gị", helper_mode: "Ọnọdụ Onye Enyemaka", trust_score: "Ihe egwurugwu ntụkwasị obi", help_count: "Enyemaka e nyere", edit: "Dezie ihe gbasara gị", logout: "Pụọ", language: "Asụsụ" },
  auth: { login: "Banyere", register: "Mepụta Akaụntụ", email: "Emeli", password: "Okwuntughe", name: "Aha Zuru Oke", email_taken: "Emeli edebanyerela", wrong_password: "Okwuntughe ezighi ezi", no_account: "Akaụntụ ọ dịghị ya n'emeli ahụ", password_setup_prompt: "E mepụtara akaụntụ gị tupu okwuntughe achọrọ. Biko deba okwuntughe maka nchedo.", set_password: "Deba Okwuntughe" },
});

// ── Twi/Akan (tw) — Ghana, Ghanaian diaspora in London, New York, D.C.
const tw = p({
  nav: { map: "Mapa", helper_dashboard: "Mapa nhyehyɛe", community: "Ɔman", wallet: "Purse", profile: "Wʼahyɛnsodeɛ" },
  common: { loading: "Ɛreka…", error: "Biribi nni ho", save: "Sie", cancel: "Gyae", close: "Tie", submit: "Fa kɔ", confirm: "Tokuro", back: "San kɔ", retry: "Sɔ bio", alerts: "Kɔkɔbɔ" },
  status: { open: "Ɛwuiɛ", claimed: "Wɔagye no", en_route: "Ɔkwan so", arrived: "Aduru", completed: "Agyae", cancelled: "Wɔagyae no", pay_it_forward_pending: "Tua Ɛkan — Ɔdwen" },
  request: { new: "Adesrɛ Foforɔ", claim: "Gye Adesrɛ", enRoute: "Fa kɔ akwankyerɛ", arrived: "Fa kɔ Aduru", complete: "Siesie", tip: "De fadie gu", sos: "SOS", title_label: "Wohia mmoa wɔ dea?", title_placeholder: "Suahu: Tɔ biribi aguabasa", description_label: "Nsɛm (nhyiamu)", description_placeholder: "Kyerɛ dea wohia…", neighborhood_label: "Asase mu", already_claimed: "Wagye no anaa wonhuu no", not_your_request: "Wo nyɛ okyekyerɛfo a wɔayi no" },
  profile: { title: "Wʼahyɛnsodeɛ", helper_mode: "Okyekyerɛfo mu", trust_score: "Gyedie Dua", help_count: "Mmoa a wode", edit: "Sesa wʼahyɛnsodeɛ", logout: "Pue", language: "Kasa" },
  auth: { login: "Bra mu", register: "Yɛ Akaawunt", email: "Imeil", password: "Akyiri nsɛm", name: "Din a ɛdi kan", email_taken: "Imeil de wɔ adwuma da ho", wrong_password: "Akyiri nsɛm nni hɔ", no_account: "Akaawunt bi nni ho wɔ imeil no", password_setup_prompt: "Wɔyɛɛ wʼakaawunt ansa na akyiri nsɛm ahia. Mesrɛ wo, fa akyiri nsɛm bi mma wo ho bɛhia ho.", set_password: "Fa Akyiri Nsɛm" },
});

// ── Wolof (wo) — Senegal, Gambia, Senegalese diaspora in Paris, New York
const wo = p({
  nav: { map: "Kaarit", helper_dashboard: "Bord bi", community: "Guox bi", wallet: "Alluwa bi", profile: "Profil bi" },
  common: { loading: "Yëgël na…", error: "Am na xam-xam bu dëkk", save: "Bëgg", cancel: "Feebar", close: "Taxaw", submit: "Yónnee", confirm: "Xam-xam", back: "Dellu", retry: "Jëfandikoo ëllëg", alerts: "Jëfënte yi" },
  status: { open: "Jeex na", claimed: "La jënd", en_route: "Ci yënn", arrived: "Dëkk na", completed: "Bëgg na", cancelled: "Feebar na", pay_it_forward_pending: "Fey ci kanam — Déllu" },
  request: { new: "Boolem bu bees", claim: "Jënd Boolem bi", enRoute: "Siiñ Ci Yënn", arrived: "Siiñ Dëkk", complete: "Dem si", tip: "Lekk akaawunt", sos: "SOS", title_label: "Lan la ngi soxor?", title_placeholder: "Taalibe: Jënd njiir", description_label: "Kanam (pokkaan)", description_placeholder: "Wax li ngay soxor…", neighborhood_label: "Dakar", already_claimed: "Jënd na wala amul", not_your_request: "Yow dul ki bëgg" },
  profile: { title: "Profil", helper_mode: "Way Fajle", trust_score: "Am Solo", help_count: "Fajle Bu Am Benn", edit: "Soppi Profil", logout: "Dem", language: "Làkk" },
  auth: { login: "Dugg", register: "Sëtu Akaawunt", email: "Imeel", password: "Alfa", name: "Tuur bi bëgg", email_taken: "Imeel bi am na", wrong_password: "Alfa bi dëkk datu", no_account: "Akaawunt amul ak imeel bi", password_setup_prompt: "Dagg na sa akaawunt léegi alfa bi dafay soxor. Bu baax na, dëgg alfa mba yëgël.", set_password: "Dëgg Alfa" },
});

// ── Haitian Creole (ht) — Haiti, diaspora in Miami, New York, Montreal
const ht = p({
  nav: { map: "Kat", helper_dashboard: "Tablo de bò", community: "Kominote", wallet: "Bous", profile: "Pwofil" },
  common: { loading: "Ap chaje…", error: "Gen yon pwoblèm", save: "Sove", cancel: "Anile", close: "Fèmen", submit: "Soumèt", confirm: "Konfime", back: "Retounen", retry: "Eseye ankò", alerts: "Avètisman" },
  status: { open: "Louvri", claimed: "Yo pran l", en_route: "Sou chemen", arrived: "Rivé", completed: "Fini", cancelled: "Anile", pay_it_forward_pending: "Peye Dèvan — Ap tann" },
  request: { new: "Nouvo Demann", claim: "Pran Demann", enRoute: "Mak Sou Chemen", arrived: "Mak Rivé", complete: "Fini", tip: "Kite Pwobwab", sos: "SOS", title_label: "Kisa ou bezwen èd pou?", title_placeholder: "Egzanp: Achte makèt", description_label: "Detay (opsyonèl)", description_placeholder: "Esplike sa ou bezwen…", neighborhood_label: "Katye", already_claimed: "Deja pran oswa pa jwenn", not_your_request: "Ou pa èd ki asiyen an" },
  profile: { title: "Pwofil", helper_mode: "Mòd Èd", trust_score: "Nòt Konfyans", help_count: "Èd Bay", edit: "Chanje Pwofil", logout: "Sòti", language: "Lang" },
  auth: { login: "Konekte", register: "Kreye Kont", email: "Imèl", password: "Modpas", name: "Non Konplè", email_taken: "Imèl sa deja anrejistre", wrong_password: "Modpas la pa bon", no_account: "Pa gen kont ak imèl sa a", password_setup_prompt: "Yo kreye kont ou anvan modpas te nesesè. Tanpri mete yon modpas pou sekirite.", set_password: "Mete Modpas" },
});

// ── Arabic (ar) — Somali/Sudanese/North African diaspora, Arab world
const ar = p({
  nav: { map: "خريطة", helper_dashboard: "لوحة التحكم", community: "المجتمع", wallet: "المحفظة", profile: "الملف الشخصي" },
  common: { loading: "جارٍ التحميل…", error: "حدث خطأ ما", save: "حفظ", cancel: "إلغاء", close: "إغلاق", submit: "إرسال", confirm: "تأكيد", back: "رجوع", retry: "إعادة المحاولة", alerts: "التنبيهات" },
  status: { open: "مفتوح", claimed: "تم المطالبة به", en_route: "في الطريق", arrived: "وصل", completed: "مكتمل", cancelled: "ملغى", pay_it_forward_pending: "الدفع للأمام — في الانتظار" },
  request: { new: "طلب جديد", claim: "المطالبة بالطلب", enRoute: "تحديد في الطريق", arrived: "تحديد الوصول", complete: "إكمال", tip: "ترك إكرامية", sos: "نجدة", title_label: "بماذا تحتاج مساعدة؟", title_placeholder: "مثال: تسوق من السوق", description_label: "التفاصيل (اختياري)", description_placeholder: "اشرح ما تحتاجه…", neighborhood_label: "الحي", already_claimed: "تمت المطالبة به أو لم يُعثر عليه", not_your_request: "أنت لست المساعد المعين" },
  profile: { title: "الملف الشخصي", helper_mode: "وضع المساعد", trust_score: "درجة الثقة", help_count: "المساعدات المقدمة", edit: "تعديل الملف الشخصي", logout: "تسجيل الخروج", language: "اللغة" },
  auth: { login: "تسجيل الدخول", register: "إنشاء حساب", email: "البريد الإلكتروني", password: "كلمة المرور", name: "الاسم الكامل", email_taken: "البريد الإلكتروني مسجل مسبقاً", wrong_password: "كلمة المرور غير صحيحة", no_account: "لم يُعثر على حساب بهذا البريد الإلكتروني", password_setup_prompt: "تم إنشاء حسابك قبل أن تصبح كلمات المرور مطلوبة. يرجى تعيين كلمة مرور للأمان.", set_password: "تعيين كلمة المرور" },
});

// ── Zulu (zu) — South Africa, Southern African diaspora
const zu = p({
  nav: { map: "Imephu", helper_dashboard: "Ibhodi lokuphatha", community: "Umphakathi", wallet: "Isikhwama", profile: "Iphrofayili" },
  common: { loading: "Iyalayisha…", error: "Kunekhona okungahambanga kahle", save: "Gcina", cancel: "Khansela", close: "Vala", submit: "Thumela", confirm: "Qinisekisa", back: "Buyela emuva", retry: "Zama futhi", alerts: "Izixwayiso" },
  status: { open: "Kuvulekile", claimed: "Kubanjwe", en_route: "Esendleleni", arrived: "Ufike", completed: "Kuqediwe", cancelled: "Kukhansele", pay_it_forward_pending: "Khokha Phambili — Ulinda" },
  request: { new: "Isicelo Esisha", claim: "Thatha Isicelo", enRoute: "Phawula Endleleni", arrived: "Phawula Ufike", complete: "Qedela", tip: "Shiya Umklomelo", sos: "SOS", title_label: "Udinga usizo ngani?", title_placeholder: "Isb: Ukuthenga ezitolo", description_label: "Imininingwane (okukhethiwe)", description_placeholder: "Chaza lokho okudingayo…", neighborhood_label: "Indawo", already_claimed: "Sekunqunyiwe noma akutholakali", not_your_request: "Awukhona umsizi obekiwe" },
  profile: { title: "Iphrofayili", helper_mode: "Indlela Yokusiza", trust_score: "Isikhali Sokwethemba", help_count: "Usizo Olunikezwe", edit: "Hlela Iphrofayili", logout: "Phuma", language: "Ulimi" },
  auth: { login: "Ngena", register: "Yenza I-Akhawunti", email: "I-imeyili", password: "Igama lokuphrinta", name: "Igama Eligcwele", email_taken: "I-imeyili isibhalisiwe", wrong_password: "Igama lokuphrinta alibulaleki", no_account: "Ayikho i-akhawunti nale imeyili", password_setup_prompt: "I-akhawunti yakho yadalwa ngaphambi kokuba amagama okuphrinta adingeke. Sicela usethe igama lokuphrinta ukuze uhlale uphephile.", set_password: "Setha Igama Lokuphrinta" },
});

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en:  { translation: en },
      es:  { translation: es },
      fr:  { translation: fr },
      pt:  { translation: pt },
      sw:  { translation: sw },
      so:  { translation: so },
      am:  { translation: am },
      yo:  { translation: yo },
      ha:  { translation: ha },
      ig:  { translation: ig },
      tw:  { translation: tw },
      wo:  { translation: wo },
      ht:  { translation: ht },
      ar:  { translation: ar },
      zu:  { translation: zu },
    },
    lng: localStorage.getItem("niakofa_lang") ?? "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export default i18n;
