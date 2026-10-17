package com.fmaking.service.dto;

public record StudentProfileDTO(
        String fullName,
        String rollNumber,
        String email,
        boolean activated,
        ProfileInfo major,
        ProfileInfo schoolClass,
        ProfileInfo term,
        ProfileInfo group,
        Integer schoolClassId,
        String selfDescription
) {
    public StudentProfileDTO(
            String fullName,
            String rollNumber,
            String email,
            boolean activated,
            ProfileInfo major,
            ProfileInfo schoolClass,
            ProfileInfo term,
            ProfileInfo group,
            Integer schoolClassId
    ) {
        this(fullName, rollNumber, email, activated, major, schoolClass, term, group, schoolClassId, null);
    }

    public record ProfileInfo(String name, String state) {
    }
}
