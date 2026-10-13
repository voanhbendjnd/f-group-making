package tech.djnd.sample.app.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import org.hibernate.validator.constraints.Length;

import java.time.Instant;

@Entity
@Table(name = "deadlines")
public class Deadline extends AbstractAuditingEntity<Integer>{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
   private Integer id;
    @Length(max = 100, min = 2)
    @NotNull
    @Column(name = "name", length = 100, nullable = false)
  private  String name;
  private  Instant startTime;
  private  Instant endTime;

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
}
