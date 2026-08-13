"use client";

import { destPhotoUrls } from "@/lib/destination-photos";
import { useEffect, useState } from "react";

const ROTATE_MS = 6500;

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
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (photos.length === 0) {
      setReady(false);
      return;
    }
    setIndex(Math.floor(Math.random() * photos.length));
    setReady(true);
  }, [dest, photos.length]);

  useEffect(() => {
    if (photos.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % photos.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [dest, photos.length]);

  if (!ready || photos.length === 0) {
    return <div className={className} aria-hidden="true" />;
  }

  const src = photos[index]!;
  return (
    <div className={className}>
      <img key={src} src={src} alt={alt} className="dest-photo__img" />
    </div>
  );
}
