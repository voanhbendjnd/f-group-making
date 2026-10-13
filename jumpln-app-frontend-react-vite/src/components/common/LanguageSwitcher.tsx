import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { type SupportedLanguage } from '@/locales/i18n';

export interface LanguageSwitcherProps {
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Crisp Vector SVG Flag of Vietnam (30x20 ratio)
const VietnamFlag: React.FC<{ width?: number; height?: number }> = ({
  width = 17,
  height = 11,
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 30 20"
    className="lang-flag"
    aria-hidden="true"
  >
    <rect width="30" height="20" fill="#da251d" />
    <polygon
      points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15"
      fill="#ffeb3b"
    />
  </svg>
);

// Crisp Vector SVG Flag of the United Kingdom (Union Jack, 60x40 ratio)
const UKFlag: React.FC<{ width?: number; height?: number }> = ({
  width = 17,
  height = 11,
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 60 40"
    className="lang-flag"
    aria-hidden="true"
  >
    <clipPath id="uk-flag-clip">
      <rect width="60" height="40" rx="2" />
    </clipPath>
    <g clipPath="url(#uk-flag-clip)">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="8" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#c8102e" strokeWidth="4" />
      <path d="M30,0 v40 M0,20 h60" stroke="#ffffff" strokeWidth="12" />
      <path d="M30,0 v40 M0,20 h60" stroke="#c8102e" strokeWidth="7" />
    </g>
  </svg>
);

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  size = 'sm',
  showLabel = false,
  className = '',
  style,
}) => {
  const { i18n, t } = useTranslation();
  const currentLang = (i18n.language?.startsWith('en') ? 'en' : 'vi') as SupportedLanguage;

  const handleSelectLanguage = (lang: SupportedLanguage) => {
    if (lang !== currentLang) {
      i18n.changeLanguage(lang);
    }
  };

  const isSmall = size === 'sm';
  const flagWidth = isSmall ? 16 : 18;
  const flagHeight = isSmall ? 11 : 12;
  const btnSizeClass = isSmall ? 'lang-btn-sm' : 'lang-btn-md';

  const switcherTrack = (
    <div
      className="lang-switcher-track"
      role="radiogroup"
      aria-label={t('common.language')}
    >
      <button
        type="button"
        role="radio"
        aria-checked={currentLang === 'vi'}
        onClick={() => handleSelectLanguage('vi')}
        title={t('common.switchToVietnamese')}
        className={`lang-btn ${btnSizeClass} ${currentLang === 'vi' ? 'is-active' : ''}`}
      >
        <VietnamFlag width={flagWidth} height={flagHeight} />
        <span>VI</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={currentLang === 'en'}
        onClick={() => handleSelectLanguage('en')}
        title={t('common.switchToEnglish')}
        className={`lang-btn ${btnSizeClass} ${currentLang === 'en' ? 'is-active' : ''}`}
      >
        <UKFlag width={flagWidth} height={flagHeight} />
        <span>EN</span>
      </button>
    </div>
  );

  if (showLabel) {
    return (
      <div
        className={`lang-switcher-wrapper ${className}`}
        style={style}
        role="region"
        aria-label={t('common.language')}
      >
        <span className="lang-switcher-label">
          <Globe size={isSmall ? 14 : 16} style={{ color: 'var(--color-primary)' }} />
          <span>{t('common.language')}:</span>
        </span>
        {switcherTrack}
      </div>
    );
  }

  return (
    <div className={`language-switcher ${className}`} style={{ display: 'inline-flex', ...style }}>
      {switcherTrack}
    </div>
  );
};
