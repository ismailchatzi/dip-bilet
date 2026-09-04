/** Booking / Trip.com arama kutusu için İngilizce şehir adı */
const BOOKING_CITY: Record<string, string> = {
  ATH: "Athens",
  BUD: "Budapest",
  VIE: "Vienna",
  PRG: "Prague",
  FCO: "Rome",
  VCE: "Venice",
  MUC: "Munich",
  BER: "Berlin",
  TBS: "Tbilisi",
  GYD: "Baku",
  SJJ: "Sarajevo",
  BEG: "Belgrade",
  TIA: "Tirana",
  SKP: "Skopje",
  SSH: "Sharm El Sheikh",
  CDG: "Paris",
  MAD: "Madrid",
  BCN: "Barcelona",
  DPS: "Bali",
  HKT: "Phuket",
  MLE: "Maldives",
  CPH: "Copenhagen",
  LHR: "London",
  AMS: "Amsterdam",
  DUB: "Dublin",
  BRU: "Brussels",
  ZRH: "Zurich",
  DXB: "Dubai",
  DOH: "Doha",
  WAW: "Warsaw",
  LIS: "Lisbon",
  MXP: "Milan",
  NCE: "Nice",
  ARN: "Stockholm",
  OSL: "Oslo",
  HEL: "Helsinki",
  BTS: "Bratislava",
  MSR: "Mus",
  VLC: "Valencia",
  ACC: "Accra",
  JED: "Jeddah",
  MED: "Medina",
  CAI: "Cairo",
  OTP: "Bucharest",
  CTA: "Catania",
  BAH: "Bahrain",
  ALG: "Algiers",
  UFA: "Ufa",
  VAN: "Van",
  OGU: "Ordu",
};

export function bookingCityQuery(iata: string, cityLabel?: string) {
  const code = iata.trim().toUpperCase();
  const mapped = BOOKING_CITY[code];
  if (mapped) return mapped;
  const label = cityLabel?.trim();
  if (label && !/^[A-Z]{3}$/i.test(label)) return label;
  return code;
}

export { BOOKING_CITY };
