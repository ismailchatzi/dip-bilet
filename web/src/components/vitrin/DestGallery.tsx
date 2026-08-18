"use client";

import { destPhotoSets } from "@/lib/destination-photos";
import { useEffect, useState } from "react";

export function DestGallery({
  dest,
  alt,
  imageUrl,
}: {
  dest: string;
  alt: string;
  imageUrl?: string;
}) {
  const local = destPhotoSets(dest);
  const fallback = imageUrl?.trim()
    ? [{ card: imageUrl.trim(), full: imageUrl.trim() }]
    : [];
  const photos = local.length > 0 ? local : fallback;
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") {
        setOpen((i) => (i == null ? i : (i + 1) % photos.length));
      }
      if (e.key === "ArrowLeft") {
        setOpen((i) =>
          i == null ? i : (i - 1 + photos.length) % photos.length,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

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
    <>
      <div className="deal-detail__gallery">
        {photos.map((src, i) => (
          <button
            key={src.card}
            type="button"
            className={
              i === 0
                ? "deal-detail__photo deal-detail__photo--main"
                : "deal-detail__photo"
            }
            onClick={() => setOpen(i)}
            aria-label={`${alt} fotoğraf ${i + 1}`}
          >
            <img
              src={src.card}
              alt={i === 0 ? alt : ""}
              className="dest-photo__img"
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          </button>
        ))}
      </div>
      {open != null ? (
        <div className="photo-viewer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="photo-viewer__backdrop"
            aria-label="Kapat"
            onClick={() => setOpen(null)}
          />
          <button
            type="button"
            className="photo-viewer__close"
            aria-label="Kapat"
            onClick={() => setOpen(null)}
          >
            ×
          </button>
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="photo-viewer__nav photo-viewer__nav--prev"
                aria-label="Önceki"
                onClick={() =>
                  setOpen((i) =>
                    i == null ? 0 : (i - 1 + photos.length) % photos.length,
                  )
                }
              >
                ‹
              </button>
              <button
                type="button"
                className="photo-viewer__nav photo-viewer__nav--next"
                aria-label="Sonraki"
                onClick={() =>
                  setOpen((i) => (i == null ? 0 : (i + 1) % photos.length))
                }
              >
                ›
              </button>
            </>
          ) : null}
          <figure className="photo-viewer__frame">
            <img src={photos[open].full} alt={alt} />
          </figure>
        </div>
      ) : null}
    </>
  );
}
