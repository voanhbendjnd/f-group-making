package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
public class CreateTermRequestDTO {

    @NotBlank(message = "Term name cannot be blank")
    @Pattern(regexp = "^(?i)(SP|SU|FALL)\\d{2}$", message = "Term name must follow format like SP26, SU26, FALL26")
    String name;
}
