package com.fmaking.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/** Time override on an existing class/session link. Membership is owned by Deadline.schoolClasses. */
@Entity
@Table(name = "school_class_deadline")
@IdClass(DeadlineClassWindow.Key.class)
@Getter
@Setter
public class DeadlineClassWindow {
    @Id @Column(name = "deadline_id")
    private Integer deadlineId;
    @Id @Column(name = "school_class_id")
    private Integer schoolClassId;
    @Column(name = "end_time_override")
    private Instant endTimeOverride;

    public static class Key implements Serializable {
        public Integer deadlineId;
        public Integer schoolClassId;
        public Key() { }
        public Key(Integer deadlineId, Integer schoolClassId) {
            this.deadlineId = deadlineId;
            this.schoolClassId = schoolClassId;
        }
        @Override public boolean equals(Object other) {
            return other instanceof Key key && Objects.equals(deadlineId, key.deadlineId)
                && Objects.equals(schoolClassId, key.schoolClassId);
        }
        @Override public int hashCode() { return Objects.hash(deadlineId, schoolClassId); }
    }
}
