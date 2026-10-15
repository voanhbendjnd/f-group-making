package com.fmaking.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfiguration implements WebSocketMessageBrokerConfigurer {

    private final com.fmaking.security.RealtimeChannelInterceptor authentication;

    public WebSocketConfiguration(com.fmaking.security.RealtimeChannelInterceptor authentication) {
        this.authentication = authentication;
    }

    @Override
    public void configureClientInboundChannel(org.springframework.messaging.simp.config.ChannelRegistration registration) {
        registration.interceptors(authentication);
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Register with SockJS support
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .withSockJS();

        // Register direct WebSocket endpoint (without SockJS)
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setPreservePublishOrder(true);
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }
}
