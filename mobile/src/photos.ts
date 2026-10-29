/** Site `destination-photos` ile aynı dosya adları (Linux case-sensitive). */
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
  JFK: [37558772, 29014458, 37558800],
  EWR: [37558772, 29014458, 37558800],
  MIA: [35065601, 14484202, 19920549],
  GRU: [6420227, 109914, 34165783],
  SYD: [39323381, 37930276, 36877480],
  ICN: [38650647, 31414671, 31414674],
  SIN: [38436983, 39717729, 35872761],
  HKG: [1058683, 36745089, 34254219],
};

const ALIAS: Record<string, string> = {
  ORY: "CDG",
  BGY: "MXP",
  STN: "LTN",
  SHJ: "DXB",
  MLH: "BSL",
  SHA: "PVG",
  PKX: "PEK",
  ITM: "KIX",
  HND: "NRT",
  EWR: "JFK",
  TFS: "TFN",
};

const SITE = "https://dipbilet.com";
const FALLBACK =
  "https://images.pexels.com/photos/3646733/pexels-photo-3646733.jpeg?auto=compress&cs=tinysrgb&w=800";

function pexelsUrl(id: number) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;
}

function resolveCode(codeOrEmpty: string) {
  const raw = codeOrEmpty.trim().toUpperCase();
  return ALIAS[raw] ?? raw;
}

export function cardPhotoUrl(codeOrEmpty: string): string {
  return cardPhotoUrls(codeOrEmpty)[0] || FALLBACK;
}

/** En fazla 3 görsel — site dosya listesi (numara uydurma yok). */
export function cardPhotoUrls(codeOrEmpty: string, primary?: string): string[] {
  const code = resolveCode(codeOrEmpty);
  const files = FILES[code];
  if (files && files.length > 0) {
    return files
      .slice(0, 3)
      .map((f) => `${SITE}/destinations/card/${f}`);
  }
  const pexels = PEXELS[code];
  if (pexels && pexels.length > 0) {
    return pexels.slice(0, 3).map(pexelsUrl);
  }
  if (primary && primary.startsWith("http")) return [primary];
  return [FALLBACK];
}
