import { TELEGRAM_CHANNEL_URL, WHATSAPP_CHANNEL_URL } from "@/lib/social-channels";

export function FollowChannels() {
  return (
    <div className="follow-channels">
      <p className="follow-channels__lead">Üye olmadan da fırsatları kaçırma:</p>
      <div className="follow-channels__links">
        <a
          className="follow-channels__btn follow-channels__btn--telegram"
          href={TELEGRAM_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Telegram&apos;dan takip et
        </a>
        <a
          className="follow-channels__btn follow-channels__btn--whatsapp"
          href={WHATSAPP_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp&apos;tan takip et
        </a>
      </div>
    </div>
  );
}
