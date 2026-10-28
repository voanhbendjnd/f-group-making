use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::{IntoResponse, Json, Response};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashMap;

use crate::AppState;

pub async fn sockjs_info() -> Response {
    let body = json!({
        "websocket": true,
        "origins": ["*:*"],
        "cookie_needed": false,
        "entropy": 2147483647
    });
    let mut resp = Json(body).into_response();
    resp.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/json;charset=UTF-8"),
    );
    resp
}

pub async fn sockjs_xhr() -> Response {
    "o\n".into_response()
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, false))
}

pub async fn sockjs_ws_handler(
    ws: WebSocketUpgrade,
    Path((_server_id, _session_id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, true))
}

async fn send_frame(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    frame: &str,
    is_sockjs: bool,
) -> bool {
    let msg = if is_sockjs {
        let json_arr = serde_json::to_string(&[frame]).unwrap_or_default();
        format!("a{}", json_arr)
    } else {
        frame.to_string()
    };
    sender.send(Message::Text(msg.into())).await.is_ok()
}

async fn handle_socket(socket: WebSocket, state: AppState, is_sockjs: bool) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.event_sender.subscribe();

    // Map of subscription_id -> topic
    let mut subscriptions: HashMap<String, String> = HashMap::new();

    // SockJS open frame
    if is_sockjs {
        let _ = sender.send(Message::Text("o".into())).await;
    }

    loop {
        tokio::select! {
            // Receive from WebSocket client
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let text_str = text.as_str().trim_matches('\0');
                        if text_str.is_empty() || text_str == "\n" || text_str == "\r\n" {
                            let ping_resp = if is_sockjs { "h" } else { "\n" };
                            let _ = sender.send(Message::Text(ping_resp.into())).await;
                            continue;
                        }

                        let frames: Vec<String> = if is_sockjs {
                            if text_str == "[]" {
                                let _ = sender.send(Message::Text("h".into())).await;
                                continue;
                            }
                            if text_str.starts_with('[') {
                                serde_json::from_str::<Vec<String>>(text_str)
                                    .unwrap_or_else(|_| vec![text_str.to_string()])
                            } else {
                                vec![text_str.to_string()]
                            }
                        } else {
                            vec![text_str.to_string()]
                        };

                        for raw_frame in frames {
                            let clean_frame = raw_frame.trim_matches('\0');
                            let lines: Vec<&str> = clean_frame.lines().collect();
                            if lines.is_empty() {
                                continue;
                            }

                            let command = lines[0].trim();
                            if command == "CONNECT" || command == "STOMP" {
                                let response = "CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0";
                                let _ = send_frame(&mut sender, response, is_sockjs).await;
                            } else if command == "SUBSCRIBE" {
                                let mut sub_id = String::new();
                                let mut destination = String::new();

                                for line in &lines[1..] {
                                    let line = line.trim();
                                    if let Some((k, v)) = line.split_once(':') {
                                        if k.trim() == "id" {
                                            sub_id = v.trim().to_string();
                                        } else if k.trim() == "destination" {
                                            destination = v.trim().to_string();
                                        }
                                    }
                                }

                                if !sub_id.is_empty() && !destination.is_empty() {
                                    subscriptions.insert(sub_id, destination);
                                }
                            } else if command == "UNSUBSCRIBE" {
                                for line in &lines[1..] {
                                    let line = line.trim();
                                    if let Some((k, v)) = line.split_once(':') {
                                        if k.trim() == "id" {
                                            subscriptions.remove(v.trim());
                                        }
                                    }
                                }
                            } else if command == "DISCONNECT" {
                                let receipt = "RECEIPT\nreceipt-id:disconnect\n\n\0";
                                let _ = send_frame(&mut sender, receipt, is_sockjs).await;
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }

            // Receive broadcast event from application
            event = rx.recv() => {
                if let Ok(ev) = event {
                    for (sub_id, dest) in &subscriptions {
                        let mut matches = false;
                        if let (Some(class_id), Some(deadline_id)) = (ev.school_class_id, ev.deadline_id) {
                            let expected_topic = format!("/topic/classes/{}/deadlines/{}/groups", class_id, deadline_id);
                            if dest == &expected_topic {
                                matches = true;
                            }
                        }
                        if let Some(class_id) = ev.school_class_id {
                            let class_topic = format!("/topic/classes/{}/deadlines", class_id);
                            if dest == &class_topic {
                                matches = true;
                            }
                        }

                        if matches {
                            let payload_json = serde_json::to_string(&ev).unwrap_or_default();
                            let msg_id = uuid::Uuid::new_v4().to_string();
                            let frame = format!(
                                "MESSAGE\nsubscription:{}\nmessage-id:{}\ndestination:{}\ncontent-type:application/json\n\n{}\0",
                                sub_id, msg_id, dest, payload_json
                            );
                            if !send_frame(&mut sender, &frame, is_sockjs).await {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}
