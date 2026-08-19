"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProductImage } from "@/components/shop-types";

type ProductGalleryProps = { images: ProductImage[]; productName: string };

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0);
  const current = images[selected];
  if (!current) return <div className="gallery-empty">NEST</div>;
  return (
    <section className="product-gallery" aria-label={`${productName} image gallery`}>
      <div className="gallery-main">
        <Image src={current.url} alt={current.alt || productName} fill unoptimized priority sizes="(max-width: 800px) 100vw, 58vw" />
        {images.length > 1 && (
          <div className="gallery-arrows">
            <button type="button" aria-label="Previous image" onClick={() => setSelected((selected - 1 + images.length) % images.length)}>←</button>
            <span>{selected + 1} / {images.length}</span>
            <button type="button" aria-label="Next image" onClick={() => setSelected((selected + 1) % images.length)}>→</button>
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbnails">
          {images.map((image, index) => (
            <button type="button" className={selected === index ? "selected" : ""} aria-label={`View image ${index + 1} of ${images.length}`} aria-current={selected === index ? "true" : undefined} key={image.id} onClick={() => setSelected(index)}>
              <Image src={image.url} alt="" fill unoptimized sizes="84px" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
