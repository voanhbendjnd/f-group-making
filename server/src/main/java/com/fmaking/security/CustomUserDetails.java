package com.fmaking.security;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import com.fmaking.domain.User;

import java.util.Collection;
import java.util.HashSet;

public record CustomUserDetails(User user) implements UserDetails {
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities(){
        HashSet<GrantedAuthority> authorities = new HashSet<>();
        if(user.getAuthorities() != null && !user.getAuthorities().isEmpty()){
            user.getAuthorities().stream().map(authority -> new SimpleGrantedAuthority(authority.getName())).forEach(authorities::add);
        }
        return authorities;
    }

    @Override
    public String getPassword() {
        return user.getPassword();
    }

    @Override
    public String getUsername() {
        return user.getEmail();
    }
}
