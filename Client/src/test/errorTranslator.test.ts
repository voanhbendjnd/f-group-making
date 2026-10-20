import { describe, it, expect } from 'vitest';
import { translateErrorMessage } from '../services/api/errorTranslator';
import i18n from '@/locales/i18n';

describe('errorTranslator', () => {
  it('retranslates cached normalized errors when switching language', async () => {
    const cached = { status: 500, message: 'Server is temporarily unavailable. Please try again later.' };
    await i18n.changeLanguage('vi');
    expect(translateErrorMessage(cached)).toBe(i18n.t('errors.status500'));
    await i18n.changeLanguage('en');
    expect(translateErrorMessage(cached)).toBe(i18n.t('errors.status500'));
    await i18n.changeLanguage('vi');
  });

  it('preserves normalized backend keys when translating again', () => {
    expect(translateErrorMessage({ status: 409, errorKey: 'ERR_GROUP_STATE_CONFLICT' }))
      .toBe(i18n.t('groupLifecycle.locked'));
    expect(translateErrorMessage({ status: 404, raw: { message: 'error.http.404' } }))
      .toBe(i18n.t('errors.status404'));
  });
  it('translates invalidactivationkey to friendly message', () => {
    const error = {
      response: {
        status: 400,
        data: { errorKey: 'invalidactivationkey' },
      },
    };
    const msg = translateErrorMessage(error);
    expect(msg).toContain('Liên kết kích hoạt không hợp lệ');
  });

  it('translates alreadyactivated error to friendly message', () => {
    const error = {
      response: {
        status: 400,
        data: { errorKey: 'alreadyactivated' },
      },
    };
    const msg = translateErrorMessage(error);
    expect(msg).toContain('Tài khoản này đã được kích hoạt');
  });

  it('translates 401 Unauthorized to friendly message', () => {
    const error = {
      response: {
        status: 401,
        data: {},
      },
    };
    const msg = translateErrorMessage(error);
    expect(msg).toContain('Email hoặc mật khẩu không chính xác');
  });

  it('translates 403 Forbidden to friendly message', () => {
    const error = {
      response: {
        status: 403,
        data: {},
      },
    };
    const msg = translateErrorMessage(error);
    expect(msg).toContain('không đủ quyền hạn');
  });

  it('translates Excel error to friendly message', () => {
    const error = {
      response: {
        status: 400,
        data: { message: 'Excel file contains no student data.' },
      },
    };
    const msg = translateErrorMessage(error);
    expect(msg).toContain('Tệp Excel không chứa dữ liệu');
  });
});
