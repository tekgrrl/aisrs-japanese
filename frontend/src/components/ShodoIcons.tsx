import React from 'react';

interface IconProps {
  className?: string;
}

// --- LEVEL 1: Sumi-suri (Ink Grinding) ---
export const IconSumisuri = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="10" width="70" height="80" rx="5" fill="currentColor" className="opacity-90" />
    <path d="M25 20H75V60C75 75 65 80 50 80C35 80 25 75 25 60V20Z" fill="black" fillOpacity="0.3" />
    <path d="M30 30Q40 25 60 28" stroke="white" strokeWidth="2" strokeOpacity="0.2" strokeLinecap="round"/>
  </svg>
);

// --- LEVEL 2: Kaisho (Block Script) ---
export const IconKaisho = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 15 L50 25" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
    <path d="M20 35 L80 35" stroke="currentColor" strokeWidth="6" strokeLinecap="butt" />
    <path d="M50 35 L25 85" stroke="currentColor" strokeWidth="6" strokeLinecap="butt" />
    <path d="M50 35 L75 85" stroke="currentColor" strokeWidth="6" strokeLinecap="butt" />
  </svg>
);

// --- LEVEL 3: Gyosho (Moving Script) ---
export const IconGyosho = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M48 15 C48 25, 52 25, 20 35 L80 35" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M50 35 Q40 60 25 80" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
    <path d="M45 45 Q60 55 75 80" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
  </svg>
);

// --- LEVEL 4: Sosho (Grass Script) ---
export const IconSosho = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M50 15 C50 15, 45 30, 80 30 C60 30, 40 40, 30 60 C40 50, 60 60, 70 80" 
      stroke="currentColor" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
      className="opacity-80"
    />
  </svg>
);

// --- LEVEL 5: Mushin (No Mind) ---
export const IconMushin = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle 
      cx="50" cy="50" r="40" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeDasharray="80 10" 
      className="opacity-90"
      transform="rotate(15 50 50)" 
    />
    <circle cx="50" cy="50" r="36" stroke="currentColor" strokeWidth="1" className="opacity-40"/>
    <text x="50" y="68" fontSize="50" fontWeight="bold" fontFamily="serif" fill="currentColor" textAnchor="middle">完</text>
  </svg>
);

// --- FEEDBACK ICONS ---
export const IconNijimi = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 20C65 20 75 35 70 50C80 60 75 80 50 80C30 80 20 65 30 50C15 40 30 20 50 20Z" fill="currentColor" className="opacity-80 blur-[1px]" />
    <path d="M50 30C60 30 65 40 60 50C65 55 60 70 50 70C40 70 35 55 40 50C35 40 40 30 50 30Z" fill="currentColor" />
  </svg>
);

export const IconKasure = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 80 L80 20" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" className="opacity-50"/>
    <path d="M25 85 L85 25" stroke="currentColor" strokeWidth="1" strokeDasharray="10 10" strokeLinecap="round" className="opacity-30"/>
    <path d="M15 75 L75 15" stroke="currentColor" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" className="opacity-40"/>
  </svg>
);

// --- UTILITY ICONS (Restored for Dashboard Compatibility) ---

// The "Enso" (Circle) - Used for Active Reviews
export const IconEnso = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M85 50C85 69.3 69.3 85 50 85C30.7 85 15 69.3 15 50C15 30.7 30.7 15 50 15C65 15 78 24 82 35" 
      stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="160 200"
      transform="rotate(-45 50 50)" 
    />
    <circle cx="85" cy="38" r="2" fill="currentColor" className="opacity-80" />
    <circle cx="88" cy="42" r="1.5" fill="currentColor" className="opacity-60" />
  </svg>
);

// The "Ink Drop" - Used for New Lessons (Simpler version of Sumi-suri)
export const IconInkDrop = ({ className = "w-12 h-12" }: IconProps) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 15C50 15 20 45 20 65C20 81.5 33.5 95 50 95C66.5 95 80 81.5 80 65C80 45 50 15 50 15Z" fill="currentColor" className="opacity-90" />
    <path d="M35 60Q40 50 55 55" stroke="white" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
  </svg>
);

// The "Hanko" - Identical to Mushin, kept for named import compatibility
export const IconHanko = IconMushin;