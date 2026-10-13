package com.fmaking.service.dto;

public record StudentProfileDTO(
        String fullName,
        String rollNumber,
        String email,
        boolean activated,
        ProfileInfo major,
        ProfileInfo schoolClass,
        ProfileInfo term,
        ProfileInfo group
) {
    public record ProfileInfo(String name, String state) {
    }
}
