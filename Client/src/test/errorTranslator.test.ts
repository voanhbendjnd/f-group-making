import { describe, it, expect } from 'vitest';
import { translateErrorMessage } from '../services/api/errorTranslator';

describe('errorTranslator', () => {
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
