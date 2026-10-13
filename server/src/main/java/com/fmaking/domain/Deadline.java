package com.fmaking.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import org.hibernate.annotations.BatchSize;
import org.hibernate.validator.constraints.Length;

import java.time.Instant;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Entity
@Table(name = "deadlines")
public class Deadline extends AbstractAuditingEntity<Integer> {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Length(max = 100, min = 2)
    @NotNull
    @Column(name = "name", length = 100, nullable = false)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @NotNull
    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @NotNull
    @Column(name = "end_time", nullable = false)
    private Instant endTime;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

    @JsonIgnore
    @ManyToMany
    @JoinTable(
        name = "school_class_deadline",
        joinColumns = @JoinColumn(name = "deadline_id", referencedColumnName = "id"),
        inverseJoinColumns = @JoinColumn(name = "school_class_id", referencedColumnName = "id")
    )
    @BatchSize(size = 20)
    private Set<SchoolClass> schoolClasses = new HashSet<>();

    @Override
    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Instant getStartTime() {
        return startTime;
    }

    public void setStartTime(Instant startTime) {
        this.startTime = startTime;
    }

    public Instant getEndTime() {
        return endTime;
    }

    public void setEndTime(Instant endTime) {
        this.endTime = endTime;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Set<SchoolClass> getSchoolClasses() {
        return schoolClasses;
    }

    public void setSchoolClasses(Set<SchoolClass> schoolClasses) {
        this.schoolClasses = schoolClasses;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Deadline deadline)) return false;
        return id != null && id.equals(deadline.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
