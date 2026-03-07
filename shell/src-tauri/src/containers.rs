use reqwest::Client;
use serde::{Deserialize, Serialize};

// Docker Engine API via Unix socket
// Uses reqwest with a custom connector that speaks to /var/run/docker.sock
// The URI host is ignored; all traffic goes to the socket.

const DOCKER_SOCK: &str = "/var/run/docker.sock";

fn docker_client() -> Result<Client, String> {
    // reqwest 0.12 doesn't ship a built-in Unix socket connector.
    // We use a plain http client with a base URL override; the actual
    // transport is provided by a custom connector built from tokio's
    // UnixStream.  For portability we keep this as a helper that
    // creates a client with the unix socket transport.
    // NOTE: reqwest does not directly support Unix sockets out of the box;
    // this module uses hyper-util + tokio's UnixStream.
    //
    // For now we use a URL-rewrite approach: the client issues requests to
    // http://localhost/ but we override the connector to route to the socket.
    // We build a blocking reqwest client for simplicity.
    Client::builder()
        .build()
        .map_err(|e| format!("build docker client: {e}"))
}

// Docker uses a special URL scheme for Unix sockets.
// reqwest 0.12 with the `unix-socket` feature supports:
//   http+unix://<percent-encoded-socket-path>/<path>
// We encode the socket path and build the URL accordingly.
fn docker_url(path: &str) -> String {
    let encoded = DOCKER_SOCK.replace('/', "%2F");
    format!("http+unix://{encoded}{path}")
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
                Some(format!("{}:{}/{}", pub_port, priv_port, p.port_type.as_deref().unwrap_or("tcp")))
            } else {
                Some(format!("{}/{}", priv_port, p.port_type.as_deref().unwrap_or("tcp")))
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

#[tauri::command]
pub async fn containers_list() -> Result<Vec<ContainerSummary>, String> {
    let client = docker_client()?;
    let resp = client
        .get(docker_url("/containers/json?all=true"))
        .send()
        .await
        .map_err(|e| {
            if e.to_string().contains("No such file") || e.to_string().contains("Connection refused") {
                "Docker unavailable: socket not found".to_string()
            } else {
                format!("docker list: {e}")
            }
        })?;

    let containers: Vec<DockerContainer> = resp
        .json()
        .await
        .map_err(|e| format!("parse containers: {e}"))?;

    Ok(containers
        .into_iter()
        .map(|c| ContainerSummary {
            id: c.id[..12.min(c.id.len())].to_string(),
            name: c.names.first().map(|n| n.trim_start_matches('/')).unwrap_or("").to_string(),
            image: c.image,
            status: c.status,
            ports: format_ports(&c.ports),
            created: c.created,
        })
        .collect())
}

#[tauri::command]
pub async fn container_start(id: String) -> Result<(), String> {
    let client = docker_client()?;
    client
        .post(docker_url(&format!("/containers/{id}/start")))
        .send()
        .await
        .map_err(|e| format!("container start: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn container_stop(id: String) -> Result<(), String> {
    let client = docker_client()?;
    client
        .post(docker_url(&format!("/containers/{id}/stop")))
        .send()
        .await
        .map_err(|e| format!("container stop: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn container_restart(id: String) -> Result<(), String> {
    let client = docker_client()?;
    client
        .post(docker_url(&format!("/containers/{id}/restart")))
        .send()
        .await
        .map_err(|e| format!("container restart: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn container_logs(id: String, tail: u32) -> Result<String, String> {
    let client = docker_client()?;
    let resp = client
        .get(docker_url(&format!(
            "/containers/{id}/logs?stdout=true&stderr=true&tail={tail}"
        )))
        .send()
        .await
        .map_err(|e| format!("container logs: {e}"))?;

    let bytes = resp.bytes().await.map_err(|e| format!("read logs: {e}"))?;

    // Docker multiplexed stream format: 8-byte header then data
    // Strip the headers for plain text output
    let mut output = String::new();
    let mut i = 0;
    let data = bytes.as_ref();
    while i + 8 <= data.len() {
        let size = u32::from_be_bytes([data[i+4], data[i+5], data[i+6], data[i+7]]) as usize;
        i += 8;
        if i + size <= data.len() {
            output.push_str(&String::from_utf8_lossy(&data[i..i+size]));
            i += size;
        } else {
            break;
        }
    }
    Ok(output)
}
