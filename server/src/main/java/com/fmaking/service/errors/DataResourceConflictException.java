package com.fmaking.service.errors;

import com.fmaking.web.rest.errors.ConflictAlertException;
import com.fmaking.web.rest.errors.ErrorConstants;

import java.io.Serial;
/*
* 409
* */
public class DataResourceConflictException extends ConflictAlertException {
    @Serial
    private static final long serialVersionUID = 1L;

    public DataResourceConflictException(String message, String entityName, String errorKey){
        super(ErrorConstants.CONFLICT, message, entityName, errorKey);
    }
}
