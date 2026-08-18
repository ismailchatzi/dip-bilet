import type { Deal } from "@/lib/types";

function stampTilt(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n + id.charCodeAt(i) * (i + 1)) % 97;
  const rot = -12 - (n % 14);
  const x = (n % 7) - 3;
  const y = ((n >> 2) % 5) - 2;
  return { rot, x, y };
}

export function OldDealStamp({ deal }: { deal: Deal }) {
  const { rot, x, y } = stampTilt(deal.id);
  return (
    <span
      className="old-deal-stamp"
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
      }}
      role="img"
      aria-label="Eski fırsat"
    >
      <span className="old-deal-stamp__ink">
        <span className="old-deal-stamp__title">
          Eski
          <br />
          fırsat
        </span>
      </span>
    </span>
  );
}
