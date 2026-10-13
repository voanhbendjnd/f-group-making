package tech.djnd.sample.app.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.experimental.FieldDefaults;
import org.hibernate.validator.constraints.Length;

import java.io.Serial;
import java.io.Serializable;
@Entity
@Table(name = "majors")
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Major extends AbstractAuditingEntity <Integer> implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Integer id;
    @NotNull
    @Length(max = 20)
    @Column(name = "code", unique = true,  nullable = false, length = 20)
    String code;

    @NotNull
    @Length(max = 50, min = 1)
    @Column(name = "name", unique = true,length = 50)
    String name;

}
