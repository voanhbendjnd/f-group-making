import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';
import en from './en.json';

export const LANGUAGE_STORAGE_KEY = 'f_group_lang';
export const SUPPORTED_LANGUAGES = ['vi', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const getInitialLanguage = (): SupportedLanguage => {
  if (typeof window === 'undefined') return 'vi';
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as SupportedLanguage;
  }
  return 'vi';
};

const initialLang = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en },
    },
    lng: initialLang,
    fallbackLng: 'vi',
    interpolation: {
      escapeValue: false,
    },
  });

// Synchronize document language attribute and title
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLang;
  document.title = i18n.t('common.pageTitle');
}

i18n.on('languageChanged', (lng: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    document.documentElement.lang = lng;
    document.title = i18n.t('common.pageTitle');
  }
});

export default i18n;
