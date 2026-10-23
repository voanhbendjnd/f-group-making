package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "students", indexes = @Index(name = "idx_students_major_id", columnList = "major_id"))
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)

public class Student{
    @Id
    @Column(name= "user_id")
    Long userId;
    @NotNull
    @Column(name = "roll_number",  nullable = false, unique = true)
    String rollNumber;
    @NotNull @Column(name = "full_name", nullable = false)
    String fullName;
    @NotNull
    @Column(name = "major_id", nullable = false)
    Integer majorId;
    @NotNull
    @Column(name = "member_code", nullable = false)
    String memberCode;
    @Column(name = "cohort", length = 255)
    String cohort;
    @Column(name = "slot_type", length = 255)
    String slotType;
    @Column(name = "school_class_id")
    Integer schoolClassId;
    @Column(name = "group_id")
    Long groupId;
    @Column(name = "self_description", length = 500)
    String selfDescription;
//    @NotNull
//    @Column(name = "email", nullable = false)
//    String email;

}
