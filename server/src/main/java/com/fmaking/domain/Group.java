package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import org.hibernate.validator.constraints.Length;

@Entity
@Table(name = "groups")
public class Group extends AbstractAuditingEntity<Long>{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private  Long id;
    @Length(max = 100, min = 2)
    @Column(name = "name", length = 100)
    private  String name;
    private  Long leaderId;
    private String reason;
    // enum
    private String status;
    @NotNull
    @Column(name = "school_class_id", nullable = false)
    private Integer schoolClassId;

    public Integer getSchoolClassId() {
        return schoolClassId;
    }

    public void setSchoolClassId(Integer schoolClassId) {
        this.schoolClassId = schoolClassId;
    }

    @Override
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Long getLeaderId() {
        return leaderId;
    }

    public void setLeaderId(Long leaderId) {
        this.leaderId = leaderId;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
