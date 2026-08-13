"use client";

import { useState } from "react";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Bunlar son dakika uçuşları mı?",
    a: "Hayır. Dip fırsatlar çoğu zaman aylar sonrasına ait tarihlerde çıkar. Esnek olduğunda daha çok seçenek yakalarsın.",
  },
  {
    q: "Business / premium ekonomi var mı?",
    a: "Şimdilik odak noktası ekonomi sınıfı dip fırsatlar. İleride business uyarıları da eklenebilir.",
  },
  {
    q: "Yurt içi ve yurt dışı destinasyonlara bakıyor musunuz?",
    a: "Şimdilik İstanbul (IST / SAW) çıkışlı yurt dışı ve seçili destinasyonlara odaklanıyoruz. Liste büyüdükçe genişleyecek.",
  },
  {
    q: "Türkiye dışından da üye olabilir miyim?",
    a: "Evet, üye olabilirsin. Taramalar şu an İstanbul kalkışlı fırsatlar için çalışıyor.",
  },
  {
    q: "SMS bildirimi gönderebilir misiniz?",
    a: "Evet. Hesap ayarlarından telefonunu doğrula, uçuş ayarlarından SMS bildirimini aç. Yeni dip fırsat hedef destinasyonlarına düşünce SMS gider.",
  },
  {
    q: "Üyelikte uçuş dışında ek avantaj var mı?",
    a: "Temel ürün dip fırsat uyarılarıdır. Panelden kalkış tercihi ve bildirim ayarlarını yönetirsin.",
  },
];

export function HomeFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="home-faq" id="sss">
      <h2>Sıkça sorulanlar</h2>
      <p className="home-faq__lead">
        Aradığını bulamadın mı?{" "}
        <a href="/iletisim">Buradan</a> bize yaz.
      </p>
      <div className="home-faq__list">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="home-faq__item">
              <button
                type="button"
                className="home-faq__q"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{item.q}</span>
                <span className="home-faq__icon" aria-hidden>
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen ? <p className="home-faq__a">{item.a}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
