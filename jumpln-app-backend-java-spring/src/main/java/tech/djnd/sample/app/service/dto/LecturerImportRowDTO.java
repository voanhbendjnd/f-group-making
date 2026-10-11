package tech.djnd.sample.app.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LecturerImportRowDTO {
    private int rowIndex;
    private String code;
    private String email;
}
