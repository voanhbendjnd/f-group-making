package com.fmaking.web.rest.errors;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.zalando.problem.AbstractThrowableProblem;
import org.zalando.problem.Status;

import java.io.Serial;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
@Getter
public class UnauthorizedAlertException extends AbstractThrowableProblem {
    @Serial
    private static final long serialVersionUID = 1L;
    private final String entityName;
    private final String errorKey;
    public UnauthorizedAlertException(String message, String entityName, String errorKey){
        this(ErrorConstants.DEFAULT_TYPE, message, entityName, errorKey);
    }
    public UnauthorizedAlertException(URI type, String defaultMessage, String entityName, String errorKey) {
        super(type, defaultMessage, Status.UNAUTHORIZED, null, null, null, getAlertParameters(entityName, errorKey));
        this.entityName = entityName;
        this.errorKey = errorKey;
    }
    private static Map<String, Object> getAlertParameters(String entityName, String errorKey) {
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("message", "error." + errorKey);
        parameters.put("params", entityName);
        return parameters;
    }
}