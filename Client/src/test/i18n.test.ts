import { describe, it, expect, beforeEach } from 'vitest';
import i18n, { LANGUAGE_STORAGE_KEY } from '../locales/i18n';
import vi from '../locales/vi.json';
import en from '../locales/en.json';
import { translateErrorMessage } from '../services/api/errorTranslator';

describe('i18n internationalization system', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('vi');
  });

  it('has perfectly mirrored keys between vi.json and en.json', () => {
    function getKeys(obj: any, prefix = ''): string[] {
      return Object.keys(obj).reduce((acc: string[], k: string) => {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          return [...acc, ...getKeys(obj[k], fullKey)];
        }
        return [...acc, fullKey];
      }, []);
    }

    const viKeys = getKeys(vi).sort();
    const enKeys = getKeys(en).sort();

    const missingInEn = viKeys.filter((k) => !enKeys.includes(k));
    const missingInVi = enKeys.filter((k) => !viKeys.includes(k));

    expect(missingInEn).toEqual([]);
    expect(missingInVi).toEqual([]);
  });

  it('initializes with Vietnamese as default or active language', () => {
    expect(i18n.language).toBe('vi');
    expect(i18n.t('common.language')).toBe('Ngôn ngữ');
    expect(i18n.t('auth.loginTitle')).toBe('Đăng nhập hệ thống');
  });

  it('switches dynamically to English and back to Vietnamese', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('common.language')).toBe('Language');
    expect(i18n.t('auth.loginTitle')).toBe('Sign in to System');
    expect(i18n.t('forgotPassword.title')).toBe('Forgot password?');
    expect(i18n.t('resetPassword.title')).toBe('Set New Password');

    // Check persistence key in localStorage
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');

    // Switch back to Vietnamese
    await i18n.changeLanguage('vi');
    expect(i18n.language).toBe('vi');
    expect(i18n.t('common.language')).toBe('Ngôn ngữ');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('vi');
  });

  it('translates error messages to English when active language is en', async () => {
    await i18n.changeLanguage('en');

    const error = {
      response: {
        status: 400,
        data: { errorKey: 'resetkeyinvalidorexpired' },
      },
    };

    const msgEn = translateErrorMessage(error);
    expect(msgEn).toBe('Password reset link is invalid or expired. Please submit a new forgot password request.');

    await i18n.changeLanguage('vi');
    const msgVi = translateErrorMessage(error);
    expect(msgVi).toBe('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại yêu cầu quên mật khẩu.');
  });
});
