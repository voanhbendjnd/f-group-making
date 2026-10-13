package com.fmaking.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

import java.io.Serial;
import java.io.Serializable;
@Entity
@Table(name = "terms")
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Term  extends AbstractAuditingEntity<Integer> implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Integer id;
    @Size(max = 20)
    @NotNull
    @Column(length = 20, name = "name")
    String name;
}
