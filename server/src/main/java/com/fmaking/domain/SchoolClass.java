package com.fmaking.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.CacheConcurrencyStrategy;
import org.hibernate.validator.constraints.Length;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "school_classes")
public class SchoolClass extends AbstractAuditingEntity<Integer>{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @Length(max = 50, min = 2)
    @Column(length = 50, name = "name", nullable = false)
    private String name;
    @Column(name = "term_id")
    private Integer termId;
    @Column(name = "lecturer_id")
    private Long lecturerId;
    @Column(name = "rules_version", nullable = false)
    private long rulesVersion = 0;

    public long getRulesVersion() {
        return rulesVersion;
    }

    public void setRulesVersion(long rulesVersion) {
        this.rulesVersion = rulesVersion;
    }
    @JsonIgnore
    @ManyToMany
    @JoinTable(
            name = "school_class_deadline",
            joinColumns = {@JoinColumn(name = "school_class_id", referencedColumnName = "id")},
            inverseJoinColumns = {@JoinColumn(name = "deadline_id", referencedColumnName = "id")}
    )
    @org.hibernate.annotations.Cache(usage = CacheConcurrencyStrategy.NONSTRICT_READ_WRITE)
    @BatchSize(size = 20)
    private List<Deadline> deadlines = new ArrayList<>();

    public List<Deadline> getDeadlines() {
        return deadlines;
    }

    public void setDeadlines(List<Deadline> deadlines) {
        this.deadlines = deadlines;
    }

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

    public Integer getTermId() {
        return termId;
    }

    public void setTermId(Integer termId) {
        this.termId = termId;
    }

    public Long getLecturerId() {
        return lecturerId;
    }

    public void setLecturerId(Long lecturerId) {
        this.lecturerId = lecturerId;
    }
}
