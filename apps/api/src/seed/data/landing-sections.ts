import type { LandingSectionType, Locale } from '@society-erp/shared';

/** One language's overrides for a section; arrays inside `content` line up by position with the English base. */
export interface LandingTranslation {
  title?: string;
  subtitle?: string;
  description?: string;
  cta?: { label?: string; secondaryLabel?: string };
  content?: Record<string, unknown>;
}

export interface DefaultLandingSection {
  page: string;
  type: LandingSectionType;
  key: string;
  sortOrder: number;
  title: string;
  subtitle?: string;
  description?: string;
  cta?: { label?: string; href?: string; secondaryLabel?: string; secondaryHref?: string };
  content: Record<string, unknown>;
  translations?: Partial<Record<Exclude<Locale, 'en'>, LandingTranslation>>;
}

/**
 * Initial website content, in English with Hindi and Gujarati translations. Fully editable from the
 * Super Admin console (Website → Landing Page); the translations are a starting point, not a limit.
 */
export const DEFAULT_LANDING_SECTIONS: DefaultLandingSection[] = [
  {
    page: 'home',
    type: 'HERO',
    key: 'hero',
    sortOrder: 0,
    title: 'Run your housing society like a modern business',
    subtitle: 'Billing, payments, accounting, visitors, complaints, amenities and governance in one configurable platform.',
    description: 'Built for RWAs, apartment complexes, gated communities and townships. Start in minutes, migrate from spreadsheets, configure everything without a developer.',
    cta: { label: 'Start free trial', href: '/signup', secondaryLabel: 'Request a demo', secondaryHref: '/contact?type=DEMO_REQUEST' },
    content: { badges: ['No setup fee', 'Free 14-day trial', 'Cancel anytime'], stats: [{ label: 'Modules', value: '30+' }, { label: 'Setup time', value: '< 1 day' }, { label: 'Uptime', value: '99.9%' }] },
    translations: {
      hi: {
        title: 'अपनी हाउसिंग सोसाइटी को एक आधुनिक व्यवसाय की तरह चलाइए',
        subtitle: 'बिलिंग, भुगतान, अकाउंटिंग, विज़िटर, शिकायतें, सुविधाएँ और गवर्नेंस — सब एक ही कॉन्फ़िगर करने योग्य प्लेटफ़ॉर्म पर।',
        description: 'RWA, अपार्टमेंट कॉम्प्लेक्स, गेटेड कम्युनिटी और टाउनशिप के लिए बनाया गया। मिनटों में शुरू करें, स्प्रेडशीट से डेटा लाएँ, और बिना डेवलपर के सब कुछ सेट करें।',
        cta: { label: 'मुफ़्त ट्रायल शुरू करें', secondaryLabel: 'डेमो माँगें' },
        content: { badges: ['कोई सेटअप फ़ीस नहीं', '14 दिन का मुफ़्त ट्रायल', 'कभी भी रद्द करें'], stats: [{ label: 'मॉड्यूल' }, { label: 'सेटअप समय', value: '< 1 दिन' }, { label: 'अपटाइम' }] },
      },
      gu: {
        title: 'તમારી હાઉસિંગ સોસાયટીને આધુનિક બિઝનેસની જેમ ચલાવો',
        subtitle: 'બિલિંગ, પેમેન્ટ, એકાઉન્ટિંગ, વિઝિટર, ફરિયાદો, સુવિધાઓ અને ગવર્નન્સ — બધું એક જ કન્ફિગર કરી શકાય તેવા પ્લેટફોર્મ પર.',
        description: 'RWA, એપાર્ટમેન્ટ કોમ્પ્લેક્સ, ગેટેડ કોમ્યુનિટી અને ટાઉનશિપ માટે બનાવેલું. મિનિટોમાં શરૂ કરો, સ્પ્રેડશીટમાંથી ડેટા લાવો, અને ડેવલપર વગર બધું સેટ કરો.',
        cta: { label: 'ફ્રી ટ્રાયલ શરૂ કરો', secondaryLabel: 'ડેમો માંગો' },
        content: { badges: ['કોઈ સેટઅપ ફી નહીં', '14 દિવસનો ફ્રી ટ્રાયલ', 'ગમે ત્યારે રદ કરો'], stats: [{ label: 'મોડ્યુલ' }, { label: 'સેટઅપ સમય', value: '< 1 દિવસ' }, { label: 'અપટાઇમ' }] },
      },
    },
  },
  {
    page: 'home',
    type: 'VALUE_PROPOSITION',
    key: 'value',
    sortOrder: 1,
    title: 'Why committees choose Society ERP',
    subtitle: 'Less chasing, more clarity.',
    content: {
      items: [
        { icon: 'Rocket', title: 'Extremely easy onboarding', description: 'Guided setup wizard, spreadsheet import with preview and validation, and sensible defaults for every module.' },
        { icon: 'SlidersHorizontal', title: 'Configure, do not code', description: 'Charge heads, categories, SLAs, approval workflows, roles and notifications are all editable by your admin.' },
        { icon: 'ShieldCheck', title: 'Strong isolation & audit', description: 'Every record is scoped to your society with a transparent audit trail for every important change.' },
        { icon: 'ArrowLeftRight', title: 'Painless committee handover', description: 'Hand over access to the next committee in one workflow while every document and ledger stays intact.' },
      ],
    },
    translations: {
      hi: {
        title: 'कमेटियाँ Society ERP क्यों चुनती हैं',
        subtitle: 'कम भाग-दौड़, ज़्यादा स्पष्टता।',
        content: {
          items: [
            { title: 'बेहद आसान शुरुआत', description: 'गाइडेड सेटअप विज़ार्ड, प्रीव्यू और वैलिडेशन के साथ स्प्रेडशीट इम्पोर्ट, और हर मॉड्यूल के लिए समझदार डिफ़ॉल्ट।' },
            { title: 'कॉन्फ़िगर करें, कोड नहीं', description: 'चार्ज हेड, कैटेगरी, SLA, अप्रूवल वर्कफ़्लो, रोल और नोटिफ़िकेशन — सब आपका एडमिन खुद बदल सकता है।' },
            { title: 'मज़बूत आइसोलेशन और ऑडिट', description: 'हर रिकॉर्ड आपकी सोसाइटी तक सीमित, और हर महत्वपूर्ण बदलाव का पारदर्शी ऑडिट ट्रेल।' },
            { title: 'कमेटी हैंडओवर बिना झंझट', description: 'एक ही वर्कफ़्लो में अगली कमेटी को एक्सेस दें, जबकि हर दस्तावेज़ और लेजर वैसा ही सुरक्षित रहे।' },
          ],
        },
      },
      gu: {
        title: 'કમિટીઓ Society ERP કેમ પસંદ કરે છે',
        subtitle: 'ઓછી દોડધામ, વધુ સ્પષ્ટતા.',
        content: {
          items: [
            { title: 'અત્યંત સરળ શરૂઆત', description: 'ગાઇડેડ સેટઅપ વિઝાર્ડ, પ્રિવ્યૂ અને વેલિડેશન સાથે સ્પ્રેડશીટ ઇમ્પોર્ટ, અને દરેક મોડ્યુલ માટે સમજદાર ડિફોલ્ટ.' },
            { title: 'કન્ફિગર કરો, કોડ નહીં', description: 'ચાર્જ હેડ, કેટેગરી, SLA, અપ્રૂવલ વર્કફ્લો, રોલ અને નોટિફિકેશન — બધું તમારો એડમિન પોતે બદલી શકે છે.' },
            { title: 'મજબૂત આઇસોલેશન અને ઓડિટ', description: 'દરેક રેકોર્ડ તમારી સોસાયટી સુધી સીમિત, અને દરેક મહત્વના ફેરફારનો પારદર્શક ઓડિટ ટ્રેલ.' },
            { title: 'કમિટી હેન્ડઓવર ઝંઝટ વગર', description: 'એક જ વર્કફ્લોમાં આગલી કમિટીને એક્સેસ આપો, જ્યારે દરેક દસ્તાવેજ અને લેજર એમ જ સુરક્ષિત રહે.' },
          ],
        },
      },
    },
  },
  {
    page: 'home',
    type: 'FEATURES',
    key: 'features',
    sortOrder: 2,
    title: 'Everything a society needs',
    subtitle: 'Finance, security, community and governance working together.',
    content: {
      items: [
        { icon: 'Receipt', title: 'Configurable billing', description: 'Fixed, per-unit, area-based and metered charges with penalties, discounts and automatic invoices.' },
        { icon: 'Wallet', title: 'Online collections', description: 'UPI, cards and net banking with server-verified payments, instant receipts and reconciliation.' },
        { icon: 'BookOpenCheck', title: 'Double-entry accounting', description: 'Chart of accounts, funds, bank reconciliation, trial balance, P&L and balance sheet.' },
        { icon: 'DoorOpen', title: 'Visitor & gate security', description: 'QR passes, walk-in approvals and a mobile-first guard app that works even on flaky networks.' },
        { icon: 'MessageSquareWarning', title: 'Helpdesk with SLA', description: 'Categories, priorities, assignment, escalation and resident feedback.' },
        { icon: 'Landmark', title: 'Governance', description: 'Meetings, AGM, resolutions, elections and a searchable document repository.' },
      ],
    },
    translations: {
      hi: {
        title: 'सोसाइटी को जो कुछ चाहिए, सब यहाँ',
        subtitle: 'फ़ाइनेंस, सुरक्षा, कम्युनिटी और गवर्नेंस — सब मिलकर काम करते हैं।',
        content: {
          items: [
            { title: 'कॉन्फ़िगर करने योग्य बिलिंग', description: 'फ़िक्स्ड, प्रति-यूनिट, एरिया-आधारित और मीटर वाले चार्ज, पेनल्टी, डिस्काउंट और ऑटोमैटिक इनवॉइस के साथ।' },
            { title: 'ऑनलाइन कलेक्शन', description: 'UPI, कार्ड और नेट बैंकिंग — सर्वर-वेरिफ़ाइड भुगतान, तुरंत रसीद और रीकंसिलिएशन।' },
            { title: 'डबल-एंट्री अकाउंटिंग', description: 'चार्ट ऑफ़ अकाउंट्स, फ़ंड, बैंक रीकंसिलिएशन, ट्रायल बैलेंस, P&L और बैलेंस शीट।' },
            { title: 'विज़िटर और गेट सुरक्षा', description: 'QR पास, वॉक-इन अप्रूवल और एक मोबाइल-फ़र्स्ट गार्ड ऐप जो कमज़ोर नेटवर्क पर भी चलता है।' },
            { title: 'SLA के साथ हेल्पडेस्क', description: 'कैटेगरी, प्रायोरिटी, असाइनमेंट, एस्केलेशन और निवासियों का फ़ीडबैक।' },
            { title: 'गवर्नेंस', description: 'मीटिंग, AGM, रेज़ोल्यूशन, चुनाव और खोजने योग्य दस्तावेज़ भंडार।' },
          ],
        },
      },
      gu: {
        title: 'સોસાયટીને જે કંઈ જોઈએ, બધું અહીં',
        subtitle: 'ફાઇનાન્સ, સુરક્ષા, કોમ્યુનિટી અને ગવર્નન્સ — બધું સાથે મળીને કામ કરે છે.',
        content: {
          items: [
            { title: 'કન્ફિગર કરી શકાય તેવું બિલિંગ', description: 'ફિક્સ્ડ, પ્રતિ-યુનિટ, એરિયા-આધારિત અને મીટર વાળા ચાર્જ, પેનલ્ટી, ડિસ્કાઉન્ટ અને ઓટોમેટિક ઇન્વોઇસ સાથે.' },
            { title: 'ઓનલાઇન કલેક્શન', description: 'UPI, કાર્ડ અને નેટ બેંકિંગ — સર્વર-વેરિફાઇડ પેમેન્ટ, તરત રસીદ અને રિકન્સિલિએશન.' },
            { title: 'ડબલ-એન્ટ્રી એકાઉન્ટિંગ', description: 'ચાર્ટ ઓફ એકાઉન્ટ્સ, ફંડ, બેંક રિકન્સિલિએશન, ટ્રાયલ બેલેન્સ, P&L અને બેલેન્સ શીટ.' },
            { title: 'વિઝિટર અને ગેટ સુરક્ષા', description: 'QR પાસ, વોક-ઇન અપ્રૂવલ અને મોબાઇલ-ફર્સ્ટ ગાર્ડ એપ જે નબળા નેટવર્ક પર પણ ચાલે છે.' },
            { title: 'SLA સાથે હેલ્પડેસ્ક', description: 'કેટેગરી, પ્રાયોરિટી, અસાઇનમેન્ટ, એસ્કેલેશન અને રહેવાસીઓનો ફીડબેક.' },
            { title: 'ગવર્નન્સ', description: 'મીટિંગ, AGM, રિઝોલ્યુશન, ચૂંટણી અને શોધી શકાય તેવો દસ્તાવેજ ભંડાર.' },
          ],
        },
      },
    },
  },
  {
    page: 'home',
    type: 'MODULES',
    key: 'modules',
    sortOrder: 3,
    title: 'Enable only the modules you need',
    subtitle: 'Every plan bundles modules; your admin switches them on or off anytime.',
    content: { showFromCatalog: true, highlight: ['billing', 'payments', 'accounting', 'visitors', 'complaints', 'amenities', 'notices', 'meetings', 'documents', 'staff', 'vendors', 'reports'] },
    translations: {
      hi: { title: 'सिर्फ़ वही मॉड्यूल चालू करें जो आपको चाहिए', subtitle: 'हर प्लान में मॉड्यूल शामिल हैं; आपका एडमिन उन्हें कभी भी चालू या बंद कर सकता है।' },
      gu: { title: 'ફક્ત તમને જોઈતા મોડ્યુલ જ ચાલુ કરો', subtitle: 'દરેક પ્લાનમાં મોડ્યુલ સામેલ છે; તમારો એડમિન તેમને ગમે ત્યારે ચાલુ કે બંધ કરી શકે છે.' },
    },
  },
  {
    page: 'home',
    type: 'HOW_IT_WORKS',
    key: 'how-it-works',
    sortOrder: 4,
    title: 'Live in three steps',
    content: {
      steps: [
        { step: 1, title: 'Sign up', description: 'Create your society and admin account. Your trial starts immediately.' },
        { step: 2, title: 'Import & configure', description: 'Upload your units and residents from Excel, pick your modules and billing rules.' },
        { step: 3, title: 'Invite the community', description: 'Committee, staff, guards and residents get role-based access from day one.' },
      ],
    },
    translations: {
      hi: {
        title: 'तीन कदमों में लाइव',
        content: {
          steps: [
            { title: 'साइन अप करें', description: 'अपनी सोसाइटी और एडमिन अकाउंट बनाएँ। ट्रायल तुरंत शुरू हो जाता है।' },
            { title: 'इम्पोर्ट और कॉन्फ़िगर करें', description: 'Excel से यूनिट और निवासी अपलोड करें, अपने मॉड्यूल और बिलिंग नियम चुनें।' },
            { title: 'कम्युनिटी को आमंत्रित करें', description: 'कमेटी, स्टाफ़, गार्ड और निवासियों को पहले दिन से रोल-आधारित एक्सेस मिलता है।' },
          ],
        },
      },
      gu: {
        title: 'ત્રણ પગલાંમાં લાઇવ',
        content: {
          steps: [
            { title: 'સાઇન અપ કરો', description: 'તમારી સોસાયટી અને એડમિન એકાઉન્ટ બનાવો. ટ્રાયલ તરત શરૂ થાય છે.' },
            { title: 'ઇમ્પોર્ટ અને કન્ફિગર કરો', description: 'Excel માંથી યુનિટ અને રહેવાસીઓ અપલોડ કરો, તમારા મોડ્યુલ અને બિલિંગ નિયમો પસંદ કરો.' },
            { title: 'કોમ્યુનિટીને આમંત્રિત કરો', description: 'કમિટી, સ્ટાફ, ગાર્ડ અને રહેવાસીઓને પહેલા દિવસથી રોલ-આધારિત એક્સેસ મળે છે.' },
          ],
        },
      },
    },
  },
  {
    page: 'home',
    type: 'SECURITY',
    key: 'security',
    sortOrder: 5,
    title: 'Security and privacy by default',
    subtitle: 'Your data belongs to your society.',
    content: {
      items: [
        { icon: 'Lock', title: 'Tenant isolation', description: 'Society data is isolated at the database and API layer and verified by automated tests.' },
        { icon: 'KeyRound', title: 'Role-based access', description: 'Fine-grained permissions per module; the server is always the security boundary.' },
        { icon: 'ScrollText', title: 'Audit trail', description: 'Logins, role changes, billing, payments and exports are all recorded.' },
        { icon: 'EyeOff', title: 'Privacy controls', description: 'Phone numbers, emails and documents are masked unless a role is allowed to see them.' },
      ],
    },
    translations: {
      hi: {
        title: 'सुरक्षा और प्राइवेसी, डिफ़ॉल्ट रूप से',
        subtitle: 'आपका डेटा आपकी सोसाइटी का है।',
        content: {
          items: [
            { title: 'टेनेंट आइसोलेशन', description: 'सोसाइटी का डेटा डेटाबेस और API स्तर पर अलग रखा जाता है और ऑटोमेटेड टेस्ट से जाँचा जाता है।' },
            { title: 'रोल-आधारित एक्सेस', description: 'हर मॉड्यूल के लिए बारीक परमिशन; सर्वर ही हमेशा सुरक्षा की सीमा है।' },
            { title: 'ऑडिट ट्रेल', description: 'लॉगइन, रोल बदलाव, बिलिंग, भुगतान और एक्सपोर्ट — सब रिकॉर्ड होते हैं।' },
            { title: 'प्राइवेसी नियंत्रण', description: 'फ़ोन नंबर, ईमेल और दस्तावेज़ तब तक छुपे रहते हैं जब तक किसी रोल को देखने की अनुमति न हो।' },
          ],
        },
      },
      gu: {
        title: 'સુરક્ષા અને પ્રાઇવસી, ડિફોલ્ટ રૂપે',
        subtitle: 'તમારો ડેટા તમારી સોસાયટીનો છે.',
        content: {
          items: [
            { title: 'ટેનન્ટ આઇસોલેશન', description: 'સોસાયટીનો ડેટા ડેટાબેઝ અને API સ્તરે અલગ રાખવામાં આવે છે અને ઓટોમેટેડ ટેસ્ટથી ચકાસાય છે.' },
            { title: 'રોલ-આધારિત એક્સેસ', description: 'દરેક મોડ્યુલ માટે બારીક પરમિશન; સર્વર જ હંમેશા સુરક્ષાની સીમા છે.' },
            { title: 'ઓડિટ ટ્રેલ', description: 'લોગિન, રોલ ફેરફાર, બિલિંગ, પેમેન્ટ અને એક્સપોર્ટ — બધું રેકોર્ડ થાય છે.' },
            { title: 'પ્રાઇવસી નિયંત્રણ', description: 'ફોન નંબર, ઇમેઇલ અને દસ્તાવેજો ત્યાં સુધી છુપાયેલા રહે છે જ્યાં સુધી કોઈ રોલને જોવાની પરવાનગી ન હોય.' },
          ],
        },
      },
    },
  },
  {
    page: 'home',
    type: 'PRICING',
    key: 'pricing',
    sortOrder: 6,
    title: 'Simple, transparent pricing',
    subtitle: 'Choose a plan that fits your society. Upgrade anytime.',
    content: { showToggle: true },
    translations: {
      hi: { title: 'सरल, पारदर्शी कीमत', subtitle: 'अपनी सोसाइटी के हिसाब से प्लान चुनें। कभी भी अपग्रेड करें।' },
      gu: { title: 'સરળ, પારદર્શક કિંમત', subtitle: 'તમારી સોસાયટી મુજબ પ્લાન પસંદ કરો. ગમે ત્યારે અપગ્રેડ કરો.' },
    },
  },
  {
    page: 'home',
    type: 'TESTIMONIALS',
    key: 'testimonials',
    sortOrder: 7,
    title: 'Trusted by committees',
    content: {
      items: [
        { name: 'Ramesh Iyer', role: 'Treasurer, Lakeview Residency', quote: 'Collections went from 60% to 94% in two months. Receipts are instant and the ledger finally matches the bank.', avatar: '' },
        { name: 'Priya Nair', role: 'Secretary, Green Meadows RWA', quote: 'The visitor app made our guards faster and residents feel safer. Setup took an afternoon.', avatar: '' },
        { name: 'Anil Shah', role: 'Chairman, Skyline Towers', quote: 'Handing over to the new committee was one click. Nothing was lost.', avatar: '' },
      ],
    },
    translations: {
      hi: {
        title: 'कमेटियों का भरोसा',
        content: {
          items: [
            { role: 'कोषाध्यक्ष, Lakeview Residency', quote: 'दो महीने में कलेक्शन 60% से 94% हो गया। रसीद तुरंत मिलती है और लेजर आख़िरकार बैंक से मैच करता है।' },
            { role: 'सचिव, Green Meadows RWA', quote: 'विज़िटर ऐप से हमारे गार्ड तेज़ हुए और निवासी ज़्यादा सुरक्षित महसूस करते हैं। सेटअप में एक दोपहर लगी।' },
            { role: 'अध्यक्ष, Skyline Towers', quote: 'नई कमेटी को हैंडओवर एक क्लिक में हो गया। कुछ भी नहीं खोया।' },
          ],
        },
      },
      gu: {
        title: 'કમિટીઓનો ભરોસો',
        content: {
          items: [
            { role: 'ખજાનચી, Lakeview Residency', quote: 'બે મહિનામાં કલેક્શન 60% થી 94% થઈ ગયું. રસીદ તરત મળે છે અને લેજર આખરે બેંક સાથે મેચ થાય છે.' },
            { role: 'સેક્રેટરી, Green Meadows RWA', quote: 'વિઝિટર એપથી અમારા ગાર્ડ ઝડપી થયા અને રહેવાસીઓ વધુ સુરક્ષિત અનુભવે છે. સેટઅપમાં એક બપોર લાગી.' },
            { role: 'ચેરમેન, Skyline Towers', quote: 'નવી કમિટીને હેન્ડઓવર એક ક્લિકમાં થઈ ગયું. કંઈ પણ ખોવાયું નહીં.' },
          ],
        },
      },
    },
  },
  {
    page: 'home',
    type: 'FAQ',
    key: 'faq',
    sortOrder: 8,
    title: 'Frequently asked questions',
    content: {
      items: [
        { question: 'Can we migrate from Excel or another ERP?', answer: 'Yes. Download our templates, upload your CSV/Excel, map columns, preview validation results and import. Nothing is imported without a preview.' },
        { question: 'Do residents need to pay anything?', answer: 'No. Residents use the app for free. Societies pay a flat subscription based on the plan.' },
        { question: 'What happens when the committee changes?', answer: 'Use Handover mode to revoke the previous committee, invite the new one and reassign roles. Data, documents and financial history stay intact.' },
        { question: 'Is online payment mandatory?', answer: 'No. Record cash, cheque and bank transfers manually, or enable the payment gateway for online collections.' },
        { question: 'Can we turn off modules we do not use?', answer: 'Yes. Society admins can disable optional modules anytime; data is preserved and restored when re-enabled.' },
      ],
    },
    translations: {
      hi: {
        title: 'अक्सर पूछे जाने वाले सवाल',
        content: {
          items: [
            { question: 'क्या हम Excel या किसी और ERP से डेटा ला सकते हैं?', answer: 'हाँ। हमारे टेम्प्लेट डाउनलोड करें, अपनी CSV/Excel अपलोड करें, कॉलम मैप करें, वैलिडेशन का प्रीव्यू देखें और इम्पोर्ट करें। बिना प्रीव्यू कुछ भी इम्पोर्ट नहीं होता।' },
            { question: 'क्या निवासियों को कुछ देना पड़ता है?', answer: 'नहीं। निवासी ऐप मुफ़्त में इस्तेमाल करते हैं। सोसाइटी प्लान के अनुसार एक तय सब्सक्रिप्शन देती है।' },
            { question: 'कमेटी बदलने पर क्या होता है?', answer: 'हैंडओवर मोड से पुरानी कमेटी का एक्सेस हटाएँ, नई को आमंत्रित करें और रोल फिर से दें। डेटा, दस्तावेज़ और वित्तीय इतिहास वैसा ही रहता है।' },
            { question: 'क्या ऑनलाइन भुगतान ज़रूरी है?', answer: 'नहीं। नकद, चेक और बैंक ट्रांसफ़र मैन्युअली दर्ज करें, या ऑनलाइन कलेक्शन के लिए पेमेंट गेटवे चालू करें।' },
            { question: 'जो मॉड्यूल इस्तेमाल नहीं करते, उन्हें बंद कर सकते हैं?', answer: 'हाँ। सोसाइटी एडमिन वैकल्पिक मॉड्यूल कभी भी बंद कर सकते हैं; डेटा सुरक्षित रहता है और फिर चालू करने पर वापस आ जाता है।' },
          ],
        },
      },
      gu: {
        title: 'વારંવાર પૂછાતા પ્રશ્નો',
        content: {
          items: [
            { question: 'શું અમે Excel કે બીજા ERP માંથી ડેટા લાવી શકીએ?', answer: 'હા. અમારા ટેમ્પલેટ ડાઉનલોડ કરો, તમારી CSV/Excel અપલોડ કરો, કોલમ મેપ કરો, વેલિડેશનનો પ્રિવ્યૂ જુઓ અને ઇમ્પોર્ટ કરો. પ્રિવ્યૂ વગર કંઈ પણ ઇમ્પોર્ટ થતું નથી.' },
            { question: 'શું રહેવાસીઓને કંઈ ચૂકવવું પડે છે?', answer: 'ના. રહેવાસીઓ એપ ફ્રીમાં વાપરે છે. સોસાયટી પ્લાન મુજબ એક નક્કી સબ્સ્ક્રિપ્શન ચૂકવે છે.' },
            { question: 'કમિટી બદલાય ત્યારે શું થાય?', answer: 'હેન્ડઓવર મોડથી જૂની કમિટીનો એક્સેસ હટાવો, નવીને આમંત્રિત કરો અને રોલ ફરી આપો. ડેટા, દસ્તાવેજો અને આર્થિક ઇતિહાસ એમ જ રહે છે.' },
            { question: 'શું ઓનલાઇન પેમેન્ટ ફરજિયાત છે?', answer: 'ના. રોકડ, ચેક અને બેંક ટ્રાન્સફર મેન્યુઅલી નોંધો, અથવા ઓનલાઇન કલેક્શન માટે પેમેન્ટ ગેટવે ચાલુ કરો.' },
            { question: 'જે મોડ્યુલ વાપરતા નથી તે બંધ કરી શકાય?', answer: 'હા. સોસાયટી એડમિન વૈકલ્પિક મોડ્યુલ ગમે ત્યારે બંધ કરી શકે છે; ડેટા સુરક્ષિત રહે છે અને ફરી ચાલુ કરતાં પાછો આવે છે.' },
          ],
        },
      },
    },
  },
  {
    page: 'home',
    type: 'CTA',
    key: 'cta',
    sortOrder: 9,
    title: 'Ready to modernise your society?',
    subtitle: 'Start your free trial today. No credit card required.',
    cta: { label: 'Start free trial', href: '/signup', secondaryLabel: 'Talk to us', secondaryHref: '/contact' },
    content: {},
    translations: {
      hi: { title: 'अपनी सोसाइटी को आधुनिक बनाने के लिए तैयार?', subtitle: 'आज ही मुफ़्त ट्रायल शुरू करें। क्रेडिट कार्ड की ज़रूरत नहीं।', cta: { label: 'मुफ़्त ट्रायल शुरू करें', secondaryLabel: 'हमसे बात करें' } },
      gu: { title: 'તમારી સોસાયટીને આધુનિક બનાવવા તૈયાર છો?', subtitle: 'આજે જ ફ્રી ટ્રાયલ શરૂ કરો. ક્રેડિટ કાર્ડની જરૂર નથી.', cta: { label: 'ફ્રી ટ્રાયલ શરૂ કરો', secondaryLabel: 'અમારી સાથે વાત કરો' } },
    },
  },
  { page: 'home', type: 'FOOTER', key: 'footer', sortOrder: 10, title: '', content: { useSettings: true } },
];
