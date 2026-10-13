package com.fmaking.security;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.hibernate.validator.internal.constraintvalidators.bv.EmailValidator;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import com.fmaking.domain.User;
import com.fmaking.repository.UserRepository;

import java.util.Locale;

/*
 * use component with define name it supportive for spring security 'AuthenticationManager' easy to find bean with name 'userDetailsService' at security where
 * */
@Service
@Component("userDetailsService")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class DomainUserDetailsService implements UserDetailsService {
    UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        String normalizedEmail = username.trim().toLowerCase(Locale.ENGLISH);
        if(new EmailValidator().isValid(normalizedEmail, null)){
            return userRepository.findOneWithAuthoritiesByEmail(normalizedEmail)
                    .map(existingUser -> this.createCustomUserDetails(normalizedEmail, existingUser))
                    .orElseThrow(() -> new UsernameNotFoundException(String.format("User with email %s was not found!", normalizedEmail)));
        }
        throw new  UsernameNotFoundException(String.format("User with email %s was not found!", normalizedEmail));
    }
    private CustomUserDetails createCustomUserDetails(String username, User user){
        if(!user.getActivated()){
            throw new UserNotActivatedException(String.format("User %s was not activated!", username));
        }
        return new CustomUserDetails(user);
    }

}
