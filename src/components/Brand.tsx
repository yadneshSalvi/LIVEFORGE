import Link from "next/link";

export function ForgeMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 2 36 11v18L20 38 4 29V11L20 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="m22 8-9 14h7l-2 10 10-16h-8l2-8Z" fill="currentColor" />
    </svg>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link
      className={`brand${small ? " brand-small" : ""}`}
      href="/"
      aria-label="Liveforge home"
    >
      <ForgeMark size={small ? 25 : 32} />
      <span>
        LIVE<span className="brand-light">FORGE</span>
      </span>
    </Link>
  );
}
