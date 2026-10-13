package com.fmaking.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

import java.io.Serial;
import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "authorities")
@Cache(usage = CacheConcurrencyStrategy.NONSTRICT_READ_WRITE)
@Getter
@Setter
public class Authority implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;
    @NotNull
    @Size(max = 50)
    @Id
    @Column(length = 50)
    private String name;

    @Override
    public boolean equals(Object o) {
        if(this == o){
            return true;
        }
        if(!(o instanceof Authority)){
            return false;
        }
        return Objects.equals(name, ((Authority)o).name);
    }
    /*
     * set can duplicate if name exist
     * */
    @Override
    public int hashCode() {
        return Objects.hash(name);
    }
}
