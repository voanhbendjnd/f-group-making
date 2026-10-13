package tech.djnd.sample.app.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportResultDTO {
    private boolean success;
    private int totalImported;
    @Builder.Default
    private List<ImportRowErrorDTO> errors = List.of();
    // No writes occur when confirmationRequired is true.
    private boolean confirmationRequired;
    @Builder.Default
    private List<String> newMajorCodes = List.of();
    @Builder.Default
    private List<String> createdMajorCodes = List.of();
}
