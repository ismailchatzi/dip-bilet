import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const destDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public", "destinations");
const cardDir = join(destDir, "card");
const fullDir = join(destDir, "full");

mkdirSync(cardDir, { recursive: true });
mkdirSync(fullDir, { recursive: true });

const files = readdirSync(destDir).filter((name) => /\.jpe?g$/i.test(name));
if (files.length === 0) {
  console.log("Kaynak jpg yok (zaten işlenmiş olabilir).");
  process.exit(0);
}

let bytesIn = 0;
let bytesCard = 0;
let bytesFull = 0;

for (const name of files) {
  const src = join(destDir, name);
  const img = sharp(src).rotate();
  const meta = await img.metadata();
  bytesIn += meta.size ?? 0;

  const cardOut = join(cardDir, name);
  const fullOut = join(fullDir, name);

  const cardInfo = await sharp(src)
    .rotate()
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(cardOut);

  const fullInfo = await sharp(src)
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(fullOut);

  bytesCard += cardInfo.size;
  bytesFull += fullInfo.size;
  unlinkSync(src);
  console.log(name);
}

console.log(
  `Kaynak ~${(bytesIn / 1e6).toFixed(1)} MB → kart ${(bytesCard / 1e6).toFixed(1)} MB + inceleme ${(bytesFull / 1e6).toFixed(1)} MB`,
);
