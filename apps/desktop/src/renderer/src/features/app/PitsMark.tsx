export function PitsMark({ className = 'size-7' }: { className?: string }) {
  return <span role="img" aria-label="Boo, mascote do Boobot" className={`pits-mark inline-flex shrink-0 items-center justify-center ${className}`}>
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className="size-full">
      <path d="M8 11.5 5.8 8.2a1 1 0 0 1 1.4-1.4l4.1 2.1a11.5 11.5 0 0 1 9.4 0l4.1-2.1a1 1 0 0 1 1.4 1.4L24 11.5a10 10 0 0 1 2 6v4.2a4.3 4.3 0 0 1-4.3 4.3h-11A4.3 4.3 0 0 1 6.4 21v-3.5a10 10 0 0 1 1.6-6Z" fill="currentColor" />
      <path d="M12 17.2v.2m8-.2v.2" stroke="hsl(var(--background))" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M13 21.2c1.8 1.4 4.2 1.4 6 0" stroke="hsl(var(--background))" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 3.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="3.1" r="1.6" fill="currentColor" />
      <circle cx="9" cy="21.8" r=".8" fill="hsl(var(--background))" opacity=".8" />
    </svg>
  </span>
}
