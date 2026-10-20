package com.fmaking.service.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.io.IOException;

public record AllocationPreviewRequest(
    @NotNull @Min(1) @JsonDeserialize(using = GroupingRuleDTO.IntegerValueDeserializer.class) Integer targetGroupCount,
    @Min(-AllocationPreviewRequest.MAX_SAFE_SEED) @Max(AllocationPreviewRequest.MAX_SAFE_SEED)
    @JsonDeserialize(using = SeedDeserializer.class) Long seed,
    @Pattern(regexp = "[0-9a-f]{64}") String previousPlanFingerprint) {

    public static final long MAX_SAFE_SEED = 9007199254740991L;

    public static class SeedDeserializer extends JsonDeserializer<Long> {
        @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) return (Long) context.handleUnexpectedToken(Long.class, parser);
            return parser.getLongValue();
        }
    }
}
