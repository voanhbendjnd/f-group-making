package com.fmaking.util;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RestResponse <T>{
    int statusCode;
    String error;
    Object message;
    T data;
}
