"use client";

import { destPhotoUrls } from "@/lib/destination-photos";
import { useEffect, useState, type ReactNode } from "react";

export function DestPhoto({
  dest,
  alt,
  className,
  imageUrl,
  children,
}: {
  dest: string;
  alt: string;
  className?: string;
  /** Google Deals thumbnail vb. — yerel foto yoksa kullanılır */
  imageUrl?: string;
  children?: ReactNode;
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
