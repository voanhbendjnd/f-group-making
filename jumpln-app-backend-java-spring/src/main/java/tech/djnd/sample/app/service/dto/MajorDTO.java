package tech.djnd.sample.app.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MajorDTO {
    Integer id;

    @NotBlank(message = "Major code must not be blank")
    @Size(max = 20, message = "Major code must not exceed 20 characters")
    String code;

    @NotBlank(message = "Major name must not be blank")
    @Size(min = 1, max = 50, message = "Major name must contain between 1 and 50 characters")
    String name;
}
