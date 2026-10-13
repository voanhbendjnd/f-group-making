package com.fmaking.service.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import com.fmaking.domain.GroupingRuleCode;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.io.IOException;

public record GroupingRuleDTO(
        @NotNull GroupingRuleCode code,
        @NotNull @Min(0) @Max(1000) @JsonDeserialize(using = IntegerValueDeserializer.class) Integer value,
        @NotNull @JsonDeserialize(using = StatusDeserializer.class) Boolean status
) {
    public static class StatusDeserializer extends JsonDeserializer<Boolean> {
        @Override
        public Boolean deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_TRUE) && !parser.hasToken(JsonToken.VALUE_FALSE)) {
                return (Boolean) context.handleUnexpectedToken(Boolean.class, parser);
            }
            return parser.getBooleanValue();
        }
    }

    public static class IntegerValueDeserializer extends JsonDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
                return (Integer) context.handleUnexpectedToken(Integer.class, parser);
            }
            return parser.getIntValue();
        }
    }
}
