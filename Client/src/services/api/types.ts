import Swal from 'sweetalert2';

/**
 * Standard API error structure normalized across backend variations
 */
export interface ApiError {
  status: number;
  message: string;
  errorKey?: string;
  detail?: string;
  violations?: Array<{ field: string; message: string }>;
  raw?: unknown;
  outcomeUnknown?: boolean;
}

export function getApiError(value: unknown): ApiError {
  if (typeof value === 'object' && value !== null && 'status' in value && 'message' in value
      && typeof value.status === 'number' && typeof value.message === 'string') return value as ApiError;
  return { status: 0, message: '', outcomeUnknown: true };
}

/**
 * Standard backend wrapper from ResFormatResponse
 */
export interface RestResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  error?: string | null;
}



interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  /** true: nút xác nhận màu đỏ (dùng cho hành động hủy/xóa) */
  danger?: boolean;
}

/**
 * Hộp thoại xác nhận thay cho window.confirm.
 * Trả về true nếu người dùng bấm xác nhận, false nếu đóng hoặc bấm hủy.
 */
export const confirmDialog = async ({
                                      title,
                                      text,
                                      confirmText = 'Xác nhận',
                                      cancelText = 'Quay lại',
                                      danger = false,
                                    }: ConfirmOptions): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text, // dùng `text` (không phải `html`) để tên do người dùng nhập không bị chèn mã HTML
    icon: danger ? 'warning' : 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: danger ? '#dc2626' : undefined,
    reverseButtons: true, // nút hủy bên trái, nút xác nhận bên phải
    focusCancel: danger, // hành động nguy hiểm: mặc định focus vào nút an toàn
  });
  return result.isConfirmed;
};