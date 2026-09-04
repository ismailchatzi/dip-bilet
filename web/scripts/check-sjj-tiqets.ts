import { discoverTiqetsCity } from "../src/lib/affiliate/activity-discover.ts";
import { englishNamesForActivityDiscovery } from "../src/lib/affiliate/activity-city-names.ts";

async function main() {
  console.log("names", await englishNamesForActivityDiscovery("SJJ", "Saraybosna", "Saraybosna"));
  console.log("cfg", await discoverTiqetsCity("SJJ", "Saraybosna", "Saraybosna"));
  console.log("names TIA", await englishNamesForActivityDiscovery("TIA", "Tiran", "Tiran"));
  console.log("cfg TIA", await discoverTiqetsCity("TIA", "Tiran", "Tiran"));
}

main().catch(console.error);
