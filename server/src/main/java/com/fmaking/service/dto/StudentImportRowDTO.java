package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentImportRowDTO {

    private int rowIndex;

    @NotBlank(message = "Roll number student not found")
    private String rollNumber;

    @NotBlank(message = "Name student not found")
    private String fullName;

    @NotBlank(message = "Major code student not found")
    private String originalMajor;

    private String majorCode;

    private String slotType;

    @NotBlank(message = "Member code student not found")
    private String memberCode;

    @NotBlank(message = "Email student not found")
    private String email;

    private String groupName;

    @NotBlank(message = "Lecturer code not found")
    private String lecturerCode;
}
