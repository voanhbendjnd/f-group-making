package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "major_term", uniqueConstraints = {
        @UniqueConstraint(name = "ux_major_term",
            columnNames = {"major_id", "term_id"}
        )
})
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MajorTerm {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;
    @NotNull
    @Column(name = "major_id", nullable = false)
    Integer majorId;
    @NotNull
    @Column(name = "term_id", nullable = false)
    Integer termId;
}
