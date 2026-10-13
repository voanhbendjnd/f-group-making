package com.fmaking.service.errors;

import com.fmaking.web.rest.errors.ErrorConstants;
import com.fmaking.web.rest.errors.NotFoundAlertException;

import java.io.Serial;
/*
* 404
* */
public class DataResourceNotFoundException extends NotFoundAlertException {
    @Serial
    private static final long serialVersionUID = 1L;

    public DataResourceNotFoundException(String message, String entityName, String errorKey){
        super(ErrorConstants.NOT_FOUND, message, entityName, errorKey);
    }

}
