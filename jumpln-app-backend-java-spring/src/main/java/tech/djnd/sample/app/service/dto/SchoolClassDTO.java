package tech.djnd.sample.app.service.dto;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SchoolClassDTO {
    Integer id;
    String name;
    Integer termId;
    String termName;
    Long lecturerId;
    String lecturerCode;
    String lecturerName;
    String lecturerEmail;
    Long studentCount;
    Instant createdDate;
}
