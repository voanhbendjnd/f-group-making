package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LecturerCreateGroupRequest {
    @NotBlank(message = "Tên nhóm không được để trống")
    @Size(min = 2, max = 100, message = "Tên nhóm phải từ 2 đến 100 ký tự")
    private String name;

    @NotEmpty(message = "Danh sách sinh viên không được rỗng")
    private List<Long> studentIds;

    private String overrideReason;
}
