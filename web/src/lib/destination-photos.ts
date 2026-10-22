import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

/** Dosya adları (Linux büyük/küçük harf ayırır) */
const FILES: Record<string, string[]> = {
  ATH: ["athens1.jpg", "athens2.jpg", "athens3.jpg"],
  BUD: ["budapest1.jpg", "budapest2.jpg", "budapest3.jpg"],
  VIE: ["vienna1.jpg", "vienna2.jpg", "vienna3.jpg"],
  PRG: ["prague1.jpg", "prague2.jpg", "prague3.jpg"],
  FCO: ["rome1.jpg", "rome2.jpg", "rome3.jpg"],
  VCE: ["venice1.jpg", "venice2.jpg", "venice3.jpg"],
  MUC: ["munich1.jpg", "munich2.jpg", "munich3.jpg"],
  BER: ["berlin1.jpg", "berlin2.jpg", "berlin3.jpg"],
  TBS: ["tbilisi1.jpg", "tbilisi2.jpg", "tbilisi3.jpg"],
  GYD: ["baku1.jpg", "baku2.jpg", "baku3.jpg"],
  SJJ: ["Sarajevo1.jpg", "Sarajevo2.jpg", "Sarajevo3.jpg"],
  BEG: ["belgrade1.jpg", "belgrade2.jpg", "belgrade3.jpg"],
  TIA: ["tirana1.jpg", "tirana2.jpg", "tirana3.jpg"],
  SKP: ["skopje1.jpg", "skopje2.jpg", "skopje3.jpg"],
  SSH: ["sharm-el-sheikh1.jpg", "sharm-el-sheikh2.jpg", "sharm-el-sheikh3.jpg"],
  CDG: ["Paris1.jpg", "Paris2.jpg", "Paris3.jpg"],
  MAD: ["Madrid1.jpg", "Madrid2.jpg", "Madrid3.jpg"],
  BCN: ["barcelona1.jpg", "barcelona2.jpg", "barcelona3.jpg"],
  DPS: ["bali1.jpg", "bali2.jpg", "bali3.jpg"],
  HKT: ["phuket1.jpg", "phuket2.jpg", "phuket3.jpg"],
  MLE: ["maldives1.jpg", "maldives2.jpg", "maldives3.jpg"],
  BHX: ["birmingham1.jpg", "birmingham2.jpg", "birmingham3.jpg"],
  SOF: ["sofia1.jpg", "sofia2.jpg", "sofia3.jpg"],
  MXP: ["milan1.jpg", "milan2.jpg", "milan3.jpg"],
  AMS: ["amsterdam1.jpg", "amsterdam2.jpg", "amsterdam3.jpg"],
  DXB: ["dubai1.jpg", "dubai2.jpg", "dubai3.jpg"],
  LTN: ["london1.jpg", "london2.jpg", "london3.jpg"],
  BKK: ["bangkok1.jpg", "bangkok2.jpg", "bangkok3.jpg"],
  FRA: ["frankfurt1.jpg", "frankfurt2.jpg", "frankfurt3.jpg"],
  DLM: ["dalaman1.jpg", "dalaman2.jpg", "dalaman3.jpg"],
  KYA: ["konya1.jpg", "konya2.jpg", "konya3.jpg"],
  ALG: ["algeria1.jpg", "algeria2.jpg"],
};

/** Sitede dosyası olmayan şehirler — Pexels fotoğraf numaraları. */
const PEXELS: Record<string, number[]> = {
  PVG: [50868, 35919936, 35586895],
  SHA: [50868, 35919936, 35586895],
  SVQ: [27379390, 30666335, 34691002],
  NAP: [12464316, 12496266, 20726092],
  MNL: [188916, 33076681, 18052704],
  HRG: [30683936, 28682229, 10037505],
  SKG: [37845027, 37845031, 34713041],
  NBO: [38133494, 36202135, 31904144],
  ECN: [29781275, 13042270, 12808960],
  DEL: [38583281, 16960242, 14523802],
  BOM: [18680889, 36874536, 37890763],
  PEK: [20683316, 7692221, 34470902],
  PKX: [20683316, 7692221, 34470902],
  CAN: [20994308, 39291534, 14230233],
  KUL: [19697641, 40092754, 433942],
  LAX: [14868803, 2695679, 31733710],
  NRT: [6058051, 29352449, 31416351],
  HND: [6058051, 29352449, 31416351],
  KIX: [4058521, 16547105, 28608380],
  ITM: [4058521, 16547105, 28608380],
  CPT: [34729802, 6790337, 37678619],
  HAM: [23024771, 29611407, 18252988],
  NUE: [32472176, 34270718, 8405817],
  RTM: [37878728, 39619436, 37427966],
  TFU: [12692135, 3945233, 38861523],
  EZE: [32983525, 34437871, 20465955],
  JFK: [37558772, 29014458, 37558800],
  EWR: [37558772, 29014458, 37558800],
  MIA: [35065601, 14484202, 19920549],
  GRU: [6420227, 109914, 34165783],
  SYD: [39323381, 37930276, 36877480],
  ICN: [38650647, 31414671, 31414674],
  SIN: [38436983, 39717729, 35872761],
  HKG: [1058683, 36745089, 34254219],
  MRS: [15878303, 29803747, 34415769],
  MED: [29102586, 6476996, 38498727],
  MLX: [30564169, 28273731, 8057328],
  NCE: [31312437, 25547418, 6587767],
  OGU: [20578634, 36135026, 31984672],
  OTP: [32940532, 38200782, 16945240],
  OVB: [11067576, 11054222, 11228946],
  PMO: [35786541, 20526956, 16588226],
  PRN: [31131305, 37736313, 29184954],
  RZV: [33358888, 37915743, 37915818],
  SVX: [11914156, 849227, 9045786],
  TJK: [20745092, 10527004, 28171817],
  TPE: [29941692, 28617722, 32277904],
  TZX: [15214392, 29512351, 37911669],
  VAN: [31871097, 32704406, 20323487],
  VAS: [11780365, 36884023, 36884021],
  VLC: [32038182, 30536606, 5204082],
  ADB: [21628380, 14267679, 30539208],
  AER: [9041761, 8589352, 8117877],
  AGP: [12876971, 38326690, 39637826],
  AJI: [31849460, 31849457, 36203089],
  AKX: [39783256, 20591582],
  ALA: [28958875, 18516837, 29170531],
  ALC: [33795366, 27848728, 38191687],
  ALG: [27622255, 36987449, 36640667],
  ALP: [36756060, 36756153, 36756155],
  AMM: [18717637, 18717590, 30791306],
  AUH: [34235063, 39208665, 31600026],
  AYT: [18761177, 35389856, 31144290],
  BAH: [6188071, 6658661, 15771919],
  BEY: [14508905, 13656242, 36349354],
  BGW: [35509988, 31780931, 34074291],
  BIO: [13247490, 30614903, 14638004],
  DMM: [25839610],
  DTM: [13612319, 17108338, 29941887],
  DUB: [38271875, 31712909, 24809739],
  DUS: [27756562, 24428654, 19136551],
  EDI: [29418688, 32793401, 14643999],
  EIN: [36577815, 11835604, 32851227],
  ERC: [32485973, 29653763],
  ERZ: [32424626, 34042952, 34773776],
  GUW: [29135774, 29139302, 29139336],
  GZT: [16531469, 30384076, 6845296],
  JED: [34744916, 36230495, 28506330],
  KCM: [30904476, 16789619, 31056819],
  KSY: [19614289, 11331892, 20383801],
  LIS: [27832064, 33283975, 30786105],
  BJL: [32839809],
  BJV: [18530342, 18961670, 31869140],
  BLQ: [36799900, 16067731, 11478831],
  BOD: [37640875, 18959050, 30732697],
  BRE: [37366775, 31730837, 19988382],
  BRI: [12464237, 35178862, 12464222],
  BRS: [9831432, 10964936, 9537393],
  BRU: [12822731, 37640937, 39140625],
  BSL: [31716268, 31716274, 31716418],
  CAI: [36224723, 12607742, 36692947],
  CGN: [29693403, 36742843, 35761084],
  CMN: [30362133, 31890453, 29325006],
  COV: [28951536, 35922861],
  CTA: [30442348, 28217127, 34903871],
  FLR: [36577431, 37122204, 2422461],
  SPU: [2901209, 32214197, 32214198],
  NTE: [2407070, 2407071, 460672],
  TNG: [3889854, 3889855, 3889860],
  TFN: [2403209, 2403210, 457882],
  TFS: [2403209, 2403210, 457882],
  EVN: [164336, 164337, 460672],
  INI: [32214197, 32214198, 326175],
  TOS: [417074, 1183099, 1571442],
  RVN: [1571442, 1183099, 417074],
  PFO: [37845027, 37845031, 34713041],
  CIT: [29135774, 29139302, 29139336],
  SCO: [29135774, 29139302, 29139336],
  YIW: [50868, 35919936, 35586895],
  ISU: [35509988, 35509989, 31780931],
  MRA: [27622255, 36987449, 36640667],
  HSA: [29135774, 29139302, 18516837],
  LFW: [32839809, 38133494, 36202135],
  ASM: [38133494, 36202135, 31904144],
  MQM: [30564169, 28273731, 8057328],
  HTY: [16531469, 30384076, 6845296],
  IGD: [31849460, 31849457, 36203089],
};

/** Aynı şehir / ekstra havalimanı → ortak foto seti */
const PHOTO_ALIAS: Record<string, string> = {
  CRL: "BRU",
  ORY: "CDG",
  BGY: "MXP",
  STN: "LTN",
  SHJ: "DXB",
  MLH: "BSL",
  SHA: "PVG",
  PKX: "PEK",
  TFS: "TFN",
  ITM: "KIX",
  HND: "NRT",
  EWR: "JFK",
  CTU: "TFU",
  AEP: "EZE",
  /** Skyscanner şehir kodu → fotoğrafı olan havalimanı */
  SEL: "ICN",
  TYO: "HND",
  LON: "LTN",
  PAR: "CDG",
  ROM: "FCO",
  MIL: "MXP",
  NYC: "JFK",
  OSA: "KIX",
  BJS: "PEK",
  SAO: "GRU",
  BUE: "EZE",
  BUH: "OTP",
};

/** Şehre ait set yokken kart düşmesin — belirli bir destinasyon değil. */
const FALLBACK_PEXELS_ID = 3646733;

function pexelsUrl(id: number, width: number) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

const NAME_TO_CODE: Record<string, string> = {
  athens: "ATH",
  atina: "ATH",
  budapest: "BUD",
  budapeşte: "BUD",
  vienna: "VIE",
  viyana: "VIE",
  prague: "PRG",
  prag: "PRG",
  rome: "FCO",
  roma: "FCO",
  venice: "VCE",
  venedik: "VCE",
  munich: "MUC",
  münih: "MUC",
  berlin: "BER",
  tbilisi: "TBS",
  tiflis: "TBS",
  baku: "GYD",
  bakü: "GYD",
  sarajevo: "SJJ",
  saraybosna: "SJJ",
  belgrade: "BEG",
  belgrad: "BEG",
  tirana: "TIA",
  tiran: "TIA",
  skopje: "SKP",
  üsküp: "SKP",
  "sharm-el-sheikh": "SSH",
  "şarm el şeyh": "SSH",
  "sarm el seyh": "SSH",
  paris: "CDG",
  madrid: "MAD",
  barcelona: "BCN",
  barselona: "BCN",
  bali: "DPS",
  phuket: "HKT",
  maldives: "MLE",
  maldivler: "MLE",
  birmingham: "BHX",
  frankfurt: "FRA",
  frankurt: "FRA",
  sofia: "SOF",
  sofya: "SOF",
  milan: "MXP",
  milano: "MXP",
  amsterdam: "AMS",
  dubai: "DXB",
  london: "LTN",
  londra: "LTN",
  bangkok: "BKK",
  dalaman: "DLM",
  konya: "KYA",
  cezayir: "ALG",
  algeria: "ALG",
  algiers: "ALG",
  alger: "ALG",
  şanghay: "PVG",
  sanghay: "PVG",
  shanghai: "PVG",
  sevilla: "SVQ",
  seville: "SVQ",
  napoli: "NAP",
  naples: "NAP",
  manila: "MNL",
  "new york": "JFK",
  "los angeles": "LAX",
  miami: "MIA",
  "são paulo": "GRU",
  "sao paulo": "GRU",
  sidney: "SYD",
  sydney: "SYD",
  tokyo: "HND",
  seul: "ICN",
  seoul: "ICN",
  "kuala lumpur": "KUL",
  singapur: "SIN",
  singapore: "SIN",
  "hong kong": "HKG",
  floransa: "FLR",
  florence: "FLR",
  firenze: "FLR",
  split: "SPU",
  nantes: "NTE",
  tanca: "TNG",
  tangier: "TNG",
  tanger: "TNG",
  tenerife: "TFN",
  erivan: "EVN",
  yerevan: "EVN",
  niş: "INI",
  nis: "INI",
  tromsø: "TOS",
  tromso: "TOS",
  rovaniemi: "RVN",
  baf: "PFO",
  paphos: "PFO",
  rotterdam: "RTM",
  chengdu: "TFU",
  "buenos aires": "EZE",
  marsilya: "MRS",
  marseille: "MRS",
};

export function fallbackDestPhotoUrl() {
  return pexelsUrl(FALLBACK_PEXELS_ID, 800);
}

for (const dest of SCRAPPA_DESTINATIONS) {
  NAME_TO_CODE[dest.name.toLocaleLowerCase("tr-TR")] = dest.code;
  NAME_TO_CODE[dest.code.toLowerCase()] = dest.code;
}

function fold(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s*\([a-z]{3}\)\s*$/i, "")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ");
}

export function destPhotoCode(input: string) {
  const raw = input.trim();
  if (/^[A-Z]{3}$/i.test(raw)) {
    const code = raw.toUpperCase();
    const aliased = PHOTO_ALIAS[code] ?? code;
    if (FILES[aliased] || PEXELS[aliased] || FILES[code] || PEXELS[code]) {
      return aliased;
    }
  }
  const folded = fold(raw);
  if (NAME_TO_CODE[folded]) return NAME_TO_CODE[folded];
  const first = folded.split(" ")[0] ?? "";
  return NAME_TO_CODE[first] ?? null;
}

export type DestPhotoSet = { card: string; full: string };

export function destPhotoSets(codeOrName: string): DestPhotoSet[] {
  const code = destPhotoCode(codeOrName);
  if (!code) return [];
  const pexels = PEXELS[code];
  if (pexels) {
    return pexels.map((id) => ({ card: pexelsUrl(id, 800), full: pexelsUrl(id, 1920) }));
  }
  return (FILES[code] ?? []).map((file) => ({
    card: `/destinations/card/${file}`,
    full: `/destinations/full/${file}`,
  }));
}

/** Yerel / Pexels seti var mı — Google thumbnail tek başına yetmez. */
export function hasDestPhotos(codeOrName: string) {
  return destPhotoSets(codeOrName).length > 0;
}

/** Kart / küçük önizleme */
export function destPhotoUrls(codeOrName: string): string[] {
  return destPhotoSets(codeOrName).map((p) => p.card);
}

export function shufflePhotos(codeOrName: string): string[] {
  const list = [...destPhotoUrls(codeOrName)];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = list[i]!;
    list[i] = list[j]!;
    list[j] = a;
  }
  return list;
}
