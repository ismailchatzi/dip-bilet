/**
 * Mail kartı görsellerini public/destinations/mail altına indirir.
 * npx tsx scripts/build-mail-photos.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hostedMailPhotoPath,
  knownDestPhotoCodes,
  sourcePhotoForMail,
} from "@/lib/destination-photos";

const root = resolve(process.cwd(), "public");
const outDir = resolve(root, "destinations/mail");
mkdirSync(outDir, { recursive: true });

async function bytesFor(source: string) {
  if (source.startsWith("/")) {
    const file = resolve(root, source.replace(/^\//, ""));
    return readFileSync(file);
  }
  const res = await fetch(source);
  if (!res.ok) throw new Error(`${res.status} ${source}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const codes = [...knownDestPhotoCodes(), "fallback"];
  let ok = 0;
  for (const code of codes) {
    const source = sourcePhotoForMail(code === "fallback" ? "" : code);
    const dest = resolve(root, hostedMailPhotoPath(code === "fallback" ? "" : code).slice(1));
    try {
      const buf = await bytesFor(source);
      if (buf.length < 1000) throw new Error(`küçük dosya ${buf.length}`);
      writeFileSync(dest, buf);
      ok += 1;
      console.log("ok", code, buf.length);
    } catch (err) {
      console.error("fail", code, source, err instanceof Error ? err.message : err);
    }
  }
  console.log({ ok, total: codes.length });
  if (ok !== codes.length) process.exitCode = 1;
}

main();
