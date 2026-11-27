package com.fmaking.service.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SendInvitationRequest {
    private Long studentId;
    private String email;
    @Size(max = 500)
    private String message;
}
