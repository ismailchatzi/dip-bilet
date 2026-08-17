"use client";

import { destPhotoUrls } from "@/lib/destination-photos";
import { useEffect, useState } from "react";

export function DestPhoto({
  dest,
  alt,
  className,
  imageUrl,
}: {
  dest: string;
  alt: string;
  className?: string;
  /** Google Deals thumbnail vb. — yerel foto yoksa kullanılır */
  imageUrl?: string;
}) {
  const photos = destPhotoUrls(dest);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (photos.length > 0) {
      setSrc(photos[Math.floor(Math.random() * photos.length)]!);
      return;
    }
    setSrc(imageUrl?.trim() || null);
  }, [dest, photos.length, imageUrl]);

  if (!src) {
    return <div className={className} aria-hidden="true" />;
  }

  return (
    <div className={className}>
      <img src={src} alt={alt} className="dest-photo__img" />
    </div>
  );
}
