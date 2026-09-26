"use client";

import { destPhotoUrls } from "@/lib/destination-photos";
import { useEffect, useState, type ReactNode } from "react";

function seedIndex(seed: string, length: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % length;
}

export function DestPhoto({
  dest,
  alt,
  className,
  imageUrl,
  seed,
  children,
}: {
  dest: string;
  alt: string;
  className?: string;
  /** Google Deals thumbnail vb. — yerel foto yoksa kullanılır */
  imageUrl?: string;
  /** Verilirse foto sunucuda da aynı seçilir (SSR’de gri kutu yok) */
  seed?: string;
  children?: ReactNode;
}) {
  const photos = destPhotoUrls(dest);
  const seeded =
    seed == null
      ? null
      : photos.length > 0
        ? photos[seedIndex(seed, photos.length)]!
        : imageUrl?.trim() || null;
  const [src, setSrc] = useState<string | null>(seeded);

  useEffect(() => {
    if (seed != null) {
      setSrc(seeded);
      return;
    }
    if (photos.length > 0) {
      setSrc(photos[Math.floor(Math.random() * photos.length)]!);
      return;
    }
    setSrc(imageUrl?.trim() || null);
  }, [dest, photos.length, imageUrl, seed, seeded]);

  if (!src) {
    return (
      <div className={className} aria-hidden={children ? undefined : true}>
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      <img
        src={src}
        alt={alt}
        className="dest-photo__img"
        loading="lazy"
        decoding="async"
      />
      {children}
    </div>
  );
}
