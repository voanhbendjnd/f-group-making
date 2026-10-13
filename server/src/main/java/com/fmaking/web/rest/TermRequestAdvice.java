package com.fmaking.web.rest;

import java.beans.PropertyEditorSupport;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.InitBinder;

/** Prevent an explicitly empty term filter from becoming an unfiltered request. */
@ControllerAdvice(assignableTypes = {StudentResource.class, LecturerResource.class, SchoolClassResource.class, AccountResource.class})
public class TermRequestAdvice {

    @InitBinder("termId")
    public void bindTermId(WebDataBinder binder) {
        binder.registerCustomEditor(Integer.class, new PropertyEditorSupport() {
            @Override
            public void setAsText(String text) {
                if (text == null || text.isBlank()) {
                    throw new IllegalArgumentException("termId must not be empty");
                }
                setValue(Integer.valueOf(text.trim()));
            }
        });
    }
}
