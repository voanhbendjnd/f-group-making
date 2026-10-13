package com.fmaking.service.errors;

import com.fmaking.web.rest.errors.BadRequestAlertException;
import com.fmaking.web.rest.errors.ErrorConstants;

import java.io.Serial;

/**
 * Exception được ném khi file Excel không hợp lệ (sai định dạng, rỗng, vượt quá dung lượng)
 * hoặc khi không thể parse nội dung file.
 * HTTP 400 Bad Request.
 */
public class ExcelImportException extends BadRequestAlertException {

    @Serial
    private static final long serialVersionUID = 1L;

    public ExcelImportException(String message) {
        super(ErrorConstants.BAD_REQUEST_TYPE, message, "student", "excel.invalid");
    }
}
