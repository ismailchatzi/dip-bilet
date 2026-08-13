"use client";

import { shufflePhotos } from "@/lib/destination-photos";
import { useEffect, useState } from "react";

export function DestGallery({ dest, alt }: { dest: string; alt: string }) {
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    setPhotos(shufflePhotos(dest));
  }, [dest]);

  if (photos.length === 0) {
    return (
      <div className="deal-detail__gallery" aria-hidden="true">
        <div className="deal-detail__photo deal-detail__photo--main" />
        <div className="deal-detail__photo" />
        <div className="deal-detail__photo" />
      </div>
    );
  }

  return (
    <div className="deal-detail__gallery">
      {photos.map((src, i) => (
        <div
          key={src}
          className={
            i === 0
              ? "deal-detail__photo deal-detail__photo--main"
              : "deal-detail__photo"
          }
        >
          <img src={src} alt={i === 0 ? alt : ""} className="dest-photo__img" />
        </div>
      ))}
    </div>
  );
}
