"use client";

import { destPhotoUrls } from "@/lib/destination-photos";
import { useEffect, useState } from "react";

export function DestPhoto({
  dest,
  alt,
  className,
}: {
  dest: string;
  alt: string;
  className?: string;
}) {
  const photos = destPhotoUrls(dest);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (photos.length === 0) {
      setSrc(null);
      return;
    }
    setSrc(photos[Math.floor(Math.random() * photos.length)]!);
  }, [dest, photos.length]);

  if (!src) {
    return <div className={className} aria-hidden="true" />;
  }

  return (
    <div className={className}>
      <img src={src} alt={alt} className="dest-photo__img" />
    </div>
  );
}
