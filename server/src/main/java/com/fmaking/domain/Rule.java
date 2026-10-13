package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;

@Entity
@Table(name = "rules", uniqueConstraints = @UniqueConstraint(
        name = "ux_rules_class_code", columnNames = {"school_class_id", "code"}))
public class Rule extends AbstractAuditingEntity<Integer>{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @NotNull
    @Column(name = "code", nullable = false, length = 50)
    private String code;
    @NotNull
    @Column(name = "school_class_id", nullable = false)
    private Integer schoolClassId;
    @Column(name = "`value`", nullable = false)
    private Integer value;

    @Column(name = "status", nullable = false)
    @org.hibernate.annotations.ColumnDefault("true")
    private boolean status = true;

    public boolean getStatus() {
        return status;
    }

    public void setStatus(boolean status) {
        this.status = status;
    }

    @Override
    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public Integer getValue() {
        return value;
    }

    public void setValue(Integer value) {
        this.value = value;
    }

    public Integer getSchoolClassId() {
        return schoolClassId;
    }

    public void setSchoolClassId(Integer schoolClassId) {
        this.schoolClassId = schoolClassId;
    }
}
