import { useId } from 'react';

// Decorative only: the class, group and student data remain in the page content.
export function AllocationIllustration() {
  const id = useId();
  return <svg className="allocation-illustration" viewBox="0 0 300 200" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-blue`} x1="50" y1="20" x2="220" y2="190" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--color-primary-border)" /><stop offset="1" stopColor="var(--color-primary)" />
      </linearGradient>
      <linearGradient id={`${id}-paper`} x1="155" y1="65" x2="255" y2="170" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--color-surface)" /><stop offset="1" stopColor="var(--color-primary-light)" />
      </linearGradient>
    </defs>
    <ellipse cx="161" cy="175" rx="120" ry="16" fill="var(--color-primary)" opacity=".07" />
    <circle cx="170" cy="98" r="78" fill="var(--color-surface)" opacity=".45" />
    <g fill={`url(#${id}-blue)`}>
      <circle cx="127" cy="68" r="22" /><path d="M90 145v-25a37 37 0 0 1 74 0v25c-20 12-54 12-74 0Z" />
      <circle cx="76" cy="104" r="16" /><path d="M49 158v-16a27 27 0 0 1 54 0v16c-15 9-39 9-54 0Z" opacity=".65" />
    </g>
    <rect x="165" y="62" width="89" height="108" rx="13" fill="var(--color-primary)" opacity=".12" transform="rotate(8 165 62)" />
    <rect x="160" y="57" width="89" height="108" rx="13" fill={`url(#${id}-paper)`} />
    <rect x="183" y="49" width="42" height="15" rx="6" fill="var(--color-primary-border)" />
    {[83, 106, 129].map(y => <g key={y}>
      <rect x="173" y={y} width="10" height="10" rx="3" fill="var(--color-primary-border)" />
      <rect x="191" y={y + 1} width="39" height="4" rx="2" fill="var(--color-primary-border)" />
      <rect x="191" y={y + 8} width="27" height="3" rx="1.5" fill="var(--color-primary-border)" opacity=".6" />
    </g>)}
    <path d="m181 33 31-14 32 14-32 14-31-14Z" fill="var(--color-primary)" />
    <path d="M193 39v13c11 9 27 9 38 0V39l-19 8-19-8Z" fill={`url(#${id}-blue)`} />
    <path d="M243 33v23" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
    <rect x="224" y="139" width="35" height="35" rx="9" fill="var(--color-primary)" transform="rotate(-10 224 139)" />
    <path d="m233 153 7 5 10-14" stroke="var(--color-surface)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <g fill="var(--color-primary-border)"><path d="m62 47 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" /><path d="m267 90 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z" /><circle cx="42" cy="101" r="3" /></g>
  </svg>;
}
