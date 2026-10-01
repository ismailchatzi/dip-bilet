export const GA_MEASUREMENT_ID = "G-Z048VGBWGW";

/** Google ile yeni kayıt: callback yazar, istemci okuyup sign_up atar. */
export const SIGNUP_COOKIE = "db_signup";

type Gtag = (...args: unknown[]) => void;

/** gtag `config`’ten önce atılan olay düşebilir; init betiği gelene kadar bekler. */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  let tries = 0;
  const send = () => {
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    if (gtag) {
      gtag("event", name, params);
      return;
    }
    if (++tries < 40) window.setTimeout(send, 250);
  };
  send();
}
