import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
  roundedClassName?: string;
  fallbackTextClassName?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 40,
  className = '',
  roundedClassName = 'rounded-xl',
  fallbackTextClassName = 'text-white font-black text-xl',
}) => {
  return (
    <div
      className={`bg-brand-600 overflow-hidden flex items-center justify-center shadow-lg ${roundedClassName} ${className}`}
      style={{ width: size, height: size }}
      aria-label="ConnectAI logo"
    >
      <img
        src="/connectai-logo.png"
        alt="ConnectAI"
        className="w-full h-full object-cover"
        onError={(e) => {
          const target = e.currentTarget as HTMLImageElement;
          target.style.display = 'none';
          const fallback = target.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
      <span className={`${fallbackTextClassName} hidden items-center justify-center w-full h-full`}>C</span>
    </div>
  );
};

