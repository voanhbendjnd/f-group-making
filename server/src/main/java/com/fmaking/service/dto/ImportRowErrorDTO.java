package com.fmaking.service.dto;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/**
 * DTO mô tả một lỗi validation tại một dòng cụ thể trong file Excel.
 */
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportRowErrorDTO {

    /** Số dòng trong file Excel (bắt đầu từ 2) */
  private  int row;

    /** Mã sinh viên tại dòng lỗi (có thể null nếu rollNumber thiếu) */
   private String rollNumber;

    /** Tên trường bị lỗi, ví dụ: "rollNumber", "fullName", "majorCode" */
    private String field;

    /** Thông điệp lỗi mô tả chi tiết vấn đề */
   private String message;

    public int getRow() {
        return row;
    }

    public void setRow(int row) {
        this.row = row;
    }

    public String getRollNumber() {
        return rollNumber;
    }

    public void setRollNumber(String rollNumber) {
        this.rollNumber = rollNumber;
    }

    public String getField() {
        return field;
    }

    public void setField(String field) {
        this.field = field;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
