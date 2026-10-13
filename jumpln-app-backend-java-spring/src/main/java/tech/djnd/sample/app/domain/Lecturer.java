package tech.djnd.sample.app.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import org.hibernate.validator.constraints.Length;

@Entity
@Table(name = "lecturers")
public class Lecturer{
    @Id
    @Column(name = "user_id")
    Long userId;
    @Length(max = 50, min = 2)
    @NotNull
    @Column(name = "code", unique = true, nullable = false, length = 50)
    String code;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }
}
