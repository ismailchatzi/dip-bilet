import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

/** Dosya adları (Linux büyük/küçük harf ayırır) */
const FILES: Record<string, [string, string, string]> = {
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
};

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
};

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
    if (FILES[code]) return code;
  }
  const folded = fold(raw);
  if (NAME_TO_CODE[folded]) return NAME_TO_CODE[folded];
  const first = folded.split(" ")[0] ?? "";
  return NAME_TO_CODE[first] ?? null;
}

export function destPhotoUrls(codeOrName: string): string[] {
  const code = destPhotoCode(codeOrName);
  if (!code) return [];
  return (FILES[code] ?? []).map((file) => `/destinations/${file}`);
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
