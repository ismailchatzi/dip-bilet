/** Sabit arka plan motifleri — içerikten bağımsız, tıklanamaz */
export function BackgroundMotifs() {
  return (
    <div className="bg-motifs" aria-hidden="true">
      <span className="bg-motif bg-motif--plane bg-motif--a">
        <PlaneIcon />
      </span>
      <span className="bg-motif bg-motif--ticket bg-motif--b">
        <TicketIcon />
      </span>
      <span className="bg-motif bg-motif--tag bg-motif--c">
        <PercentIcon />
      </span>
      <span className="bg-motif bg-motif--plane bg-motif--d">
        <PlaneIcon />
      </span>
      <span className="bg-motif bg-motif--ticket bg-motif--e">
        <TicketIcon />
      </span>
      <span className="bg-motif bg-motif--bag bg-motif--f">
        <BagIcon />
      </span>
      <span className="bg-motif bg-motif--tag bg-motif--g">
        <PercentIcon />
      </span>
      <span className="bg-motif bg-motif--plane bg-motif--h">
        <PlaneIcon />
      </span>
      <span className="bg-motif bg-motif--ticket bg-motif--i">
        <TicketIcon />
      </span>
      <span className="bg-motif bg-motif--bag bg-motif--j">
        <BagIcon />
      </span>
    </div>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M58 30.5 38 34l-8.5 18.5-5-1.5 5.5-17L12 28l-5 4-3-1 4.5-7.5L4 16l3-1 5 4 18.5-6.5-5.5-17 5-1.5L38 12.5l20 3.5v14.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 22a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v6a5 5 0 1 0 0 10v6a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4v-6a5 5 0 1 0 0-10v-6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M26 20v24M34 26h10M34 32h10M34 38h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PercentIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="10"
        y="14"
        width="44"
        height="36"
        rx="8"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="24" cy="28" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="40" cy="36" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="m22 40 20-16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="14"
        y="22"
        width="36"
        height="30"
        rx="6"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M24 22v-4a8 8 0 0 1 16 0v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 34h36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
