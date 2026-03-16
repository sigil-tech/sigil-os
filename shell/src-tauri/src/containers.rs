use bytes::Bytes;
use http_body_util::{BodyExt, Empty, Full};
use hyper::{Method, Request};
use hyper::client::conn::http1;
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio::net::UnixStream;

const DOCKER_SOCK: &str = "/var/run/docker.sock";

async fn docker_get(path: &str) -> Result<Bytes, String> {
    let stream = UnixStream::connect(DOCKER_SOCK).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound
            || e.kind() == std::io::ErrorKind::ConnectionRefused
        {
            "Docker unavailable: socket not found".to_string()
        } else {
            format!("docker connect: {e}")
        }
    })?;
    let io = TokioIo::new(stream);
    let (mut sender, conn) = http1::handshake(io)
        .await
        .map_err(|e| format!("docker handshake: {e}"))?;
    tokio::spawn(conn);

    let req = Request::builder()
        .method(Method::GET)
        .uri(format!("http://localhost{path}"))
        .header("Host", "localhost")
        .body(Empty::<Bytes>::new())
        .map_err(|e| format!("build request: {e}"))?;

    let resp = sender
        .send_request(req)
        .await
        .map_err(|e| format!("docker request: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("docker error: HTTP {}", resp.status()));
    }

    resp.into_body()
        .collect()
        .await
        .map(|c| c.to_bytes())
        .map_err(|e| format!("read body: {e}"))
}

async fn docker_post(path: &str) -> Result<(), String> {
    let stream = UnixStream::connect(DOCKER_SOCK).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound
            || e.kind() == std::io::ErrorKind::ConnectionRefused
        {
            "Docker unavailable: socket not found".to_string()
        } else {
            format!("docker connect: {e}")
        }
    })?;
    let io = TokioIo::new(stream);
    let (mut sender, conn) = http1::handshake(io)
        .await
        .map_err(|e| format!("docker handshake: {e}"))?;
    tokio::spawn(conn);

    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("http://localhost{path}"))
        .header("Host", "localhost")
        .header("Content-Length", "0")
        .body(Full::<Bytes>::new(Bytes::new()))
        .map_err(|e| format!("build request: {e}"))?;

    let resp = sender
        .send_request(req)
        .await
        .map_err(|e| format!("docker request: {e}"))?;

    // 204 No Content is success for start/stop/restart; 304 Not Modified for already-running
    if resp.status().is_success() || resp.status().as_u16() == 304 {
        Ok(())
    } else {
        Err(format!("docker error: HTTP {}", resp.status()))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContainerSummary {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub ports: String,
    pub created: i64,
}

#[derive(Debug, Deserialize)]
struct DockerContainer {
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "Names")]
    names: Vec<String>,
    #[serde(rename = "Image")]
    image: String,
    #[serde(rename = "Status")]
    status: String,
    #[serde(rename = "Ports")]
    ports: Vec<DockerPort>,
    #[serde(rename = "Created")]
    created: i64,
}

#[derive(Debug, Deserialize)]
struct DockerPort {
    #[serde(rename = "PublicPort")]
    public_port: Option<u16>,
    #[serde(rename = "PrivatePort")]
    private_port: Option<u16>,
    #[serde(rename = "Type")]
    port_type: Option<String>,
}

fn format_ports(ports: &[DockerPort]) -> String {
    ports
        .iter()
        .filter_map(|p| {
            let priv_port = p.private_port?;
            if let Some(pub_port) = p.public_port {
                Some(format!(
                    "{}:{}/{}",
                    pub_port,
                    priv_port,
                    p.port_type.as_deref().unwrap_or("tcp")
                ))
            } else {
                Some(format!(
                    "{}/{}",
                    priv_port,
                    p.port_type.as_deref().unwrap_or("tcp")
                ))
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

#[tauri::command]
pub async fn containers_list() -> Result<Vec<ContainerSummary>, String> {
    let body = docker_get("/containers/json?all=true").await?;
    let containers: Vec<DockerContainer> =
        serde_json::from_slice(&body).map_err(|e| format!("parse containers: {e}"))?;

    Ok(containers
        .into_iter()
        .map(|c| ContainerSummary {
            id: c.id[..12.min(c.id.len())].to_string(),
            name: c
                .names
                .first()
                .map(|n| n.trim_start_matches('/'))
                .unwrap_or("")
                .to_string(),
            image: c.image,
            status: c.status,
            ports: format_ports(&c.ports),
            created: c.created,
        })
        .collect())
}

#[tauri::command]
pub async fn container_start(id: String) -> Result<(), String> {
    docker_post(&format!("/containers/{id}/start")).await
}

#[tauri::command]
pub async fn container_stop(id: String) -> Result<(), String> {
    docker_post(&format!("/containers/{id}/stop")).await
}

#[tauri::command]
pub async fn container_restart(id: String) -> Result<(), String> {
    docker_post(&format!("/containers/{id}/restart")).await
}

#[tauri::command]
pub async fn container_logs(id: String, tail: u32) -> Result<String, String> {
    let body = docker_get(&format!(
        "/containers/{id}/logs?stdout=true&stderr=true&tail={tail}"
    ))
    .await?;

    // Docker multiplexed stream: 8-byte header (stream type + size) then payload
    let mut output = String::new();
    let data = body.as_ref();
    let mut i = 0;
    while i + 8 <= data.len() {
        let size =
            u32::from_be_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]) as usize;
        i += 8;
        if i + size <= data.len() {
            output.push_str(&String::from_utf8_lossy(&data[i..i + size]));
            i += size;
        } else {
            break;
        }
    }
    Ok(output)
}
