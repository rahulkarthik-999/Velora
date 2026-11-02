import React from 'react';
import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  href?: string;
}

export function VeloraSymbol({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="veloraGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f3e7c4" />
          <stop offset="35%" stopColor="#d4af37" />
          <stop offset="70%" stopColor="#aa8222" />
          <stop offset="100%" stopColor="#e5c158" />
        </linearGradient>
        <radialGradient id="veloraHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d4af37" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#070709" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle background glow */}
      <circle cx="50" cy="50" r="46" fill="url(#veloraHalo)" />

      {/* Thin elegant luminous halo ring */}
      <circle
        cx="50"
        cy="50"
        r="32"
        stroke="url(#veloraGoldGrad)"
        strokeWidth="1.8"
        strokeOpacity="0.85"
      />

      {/* Left Wing Ribbon */}
      <path
        d="M26 28 C30 42, 42 66, 50 82 C46 64, 40 46, 33 34 Z"
        fill="url(#veloraGoldGrad)"
      />
      <path
        d="M26 28 C33 38, 44 58, 50 82 C47 62, 38 42, 26 28 Z"
        fill="#f6eedb"
        fillOpacity="0.4"
      />

      {/* Right Wing Ribbon */}
      <path
        d="M74 28 C70 42, 58 66, 50 82 C54 64, 60 46, 67 34 Z"
        fill="url(#veloraGoldGrad)"
      />
      <path
        d="M74 28 C67 38, 56 58, 50 82 C53 62, 62 42, 74 28 Z"
        fill="#f6eedb"
        fillOpacity="0.4"
      />
    </svg>
  );
}

export function Logo({
  size = 'md',
  showText = true,
  className = '',
  href = '/',
}: LogoProps) {
  const sizeMap = {
    sm: { symbol: 'w-5 h-5', text: 'text-xs tracking-[0.2em]' },
    md: { symbol: 'w-7 h-7', text: 'text-sm tracking-[0.25em]' },
    lg: { symbol: 'w-10 h-10', text: 'text-lg tracking-[0.28em]' },
    xl: { symbol: 'w-14 h-14', text: 'text-2xl tracking-[0.3em]' },
  };

  const content = (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <VeloraSymbol className={sizeMap[size].symbol} />
      {showText && (
        <span
          className={`font-semibold uppercase text-white font-sans ${sizeMap[size].text} select-none`}
        >
          VELORA
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center group">
        {content}
      </Link>
    );
  }

  return content;
}
