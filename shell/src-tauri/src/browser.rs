use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, WebviewUrl};

pub struct BrowserState(pub Arc<Mutex<Option<tauri::Webview<tauri::Wry>>>>);

/// Walk up from a WebKitWebView to find the direct child of a GtkOverlay.
/// After reparenting, the overlay child is the widget we need to set
/// margins/size on (it may be a wrapper around the raw webview).
fn find_overlay_child(widget: &gtk::Widget) -> Option<gtk::Widget> {
    use gtk::prelude::*;
    let mut child = widget.clone();
    while let Some(parent) = child.parent() {
        if parent.downcast_ref::<gtk::Overlay>().is_some() {
            return Some(child);
        }
        child = parent;
    }
    None
}

impl BrowserState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

#[tauri::command]
pub fn browser_create(
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    window: tauri::Window,
    state: tauri::State<'_, BrowserState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    if let Some(ref webview) = *guard {
        webview.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = webview.with_webview(move |platform| {
            use gtk::prelude::*;
            let wv: gtk::Widget = platform.inner().clone().upcast();
            // Find the overlay child wrapper (parent of the webview in the overlay)
            let target = find_overlay_child(&wv).unwrap_or(wv);
            target.set_margin_start(x as i32);
            target.set_margin_top(y as i32);
            target.set_size_request(width as i32, height as i32);
            target.show();
        });
        return Ok(());
    }

    let app_handle = window.app_handle().clone();

    let builder = tauri::webview::WebviewBuilder::new("browser", WebviewUrl::External(parsed))
        .on_navigation({
            let app = app_handle.clone();
            move |url| {
                let _ = app.emit(
                    "browser-url-changed",
                    serde_json::json!({ "url": url.to_string() }),
                );
                true
            }
        })
        .on_page_load({
            let app = app_handle.clone();
            move |_webview, payload| {
                let url_str = payload.url().to_string();
                match payload.event() {
                    tauri::webview::PageLoadEvent::Started => {
                        let _ = app.emit(
                            "browser-load-started",
                            serde_json::json!({ "url": url_str }),
                        );
                    }
                    tauri::webview::PageLoadEvent::Finished => {
                        let _ = app.emit(
                            "browser-load-finished",
                            serde_json::json!({ "url": url_str }),
                        );
                    }
                }
            }
        });

    // Create with zero size — will be positioned after GTK reparenting
    let webview = window
        .add_child(
            builder,
            tauri::LogicalPosition::new(0.0, 0.0),
            tauri::LogicalSize::new(0.0, 0.0),
        )
        .map_err(|e| e.to_string())?;

    // Reparent: wry puts both webviews in a GtkBox (vertical stacking).
    // We move them into a GtkOverlay so the browser overlays the main UI.
    // NOTE: platform.inner() returns the raw WebKitWebView, which may be
    // wrapped in intermediate containers. We walk up the parent chain to
    // find the GtkBox, then operate on its direct children (the wrappers).
    let _ = webview.with_webview(move |platform| {
        use gtk::prelude::*;
        let browser_wv: gtk::Widget = platform.inner().clone().upcast();

        // Walk up from the WebKitWebView to find the GtkBox container
        let mut cursor = browser_wv.clone();
        let vbox: Option<gtk::Box> = loop {
            match cursor.parent() {
                Some(parent) => {
                    if let Ok(b) = parent.clone().downcast::<gtk::Box>() {
                        break Some(b);
                    }
                    cursor = parent;
                }
                None => break None,
            }
        };

        if let Some(vbox) = vbox {
            let children = vbox.children();
            if children.len() >= 2 {
                // children[0] = main webview (or its wrapper)
                // children[1] = browser webview (or its wrapper)
                let main_child = children[0].clone();
                let browser_child = children[1].clone();

                // Remove both from the GtkBox
                vbox.remove(&main_child);
                vbox.remove(&browser_child);

                // Create overlay: main webview fills space, browser overlays on top
                let overlay = gtk::Overlay::new();
                overlay.add(&main_child);

                // Position browser absolutely via margins
                browser_child.set_halign(gtk::Align::Start);
                browser_child.set_valign(gtk::Align::Start);
                browser_child.set_margin_start(x as i32);
                browser_child.set_margin_top(y as i32);
                browser_child.set_size_request(width as i32, height as i32);
                browser_child.set_hexpand(false);
                browser_child.set_vexpand(false);

                overlay.add_overlay(&browser_child);

                // Pack the overlay into the vbox (replaces the two children)
                vbox.pack_start(&overlay, true, true, 0);
                overlay.show_all();
            }
        }
    });

    *guard = Some(webview);
    Ok(())
}

#[tauri::command]
pub fn browser_navigate(
    url: String,
    state: tauri::State<'_, BrowserState>,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let webview = guard.as_ref().ok_or("browser not created")?;
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    webview.navigate(parsed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_back(state: tauri::State<'_, BrowserState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let webview = guard.as_ref().ok_or("browser not created")?;
    webview.eval("history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_forward(state: tauri::State<'_, BrowserState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let webview = guard.as_ref().ok_or("browser not created")?;
    webview
        .eval("history.forward()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_reload(state: tauri::State<'_, BrowserState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let webview = guard.as_ref().ok_or("browser not created")?;
    webview.reload().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_show(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    state: tauri::State<'_, BrowserState>,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let webview = guard.as_ref().ok_or("browser not created")?;
    // Position via GTK margins on the overlay child wrapper
    let _ = webview.with_webview(move |platform| {
        use gtk::prelude::*;
        let wv: gtk::Widget = platform.inner().clone().upcast();
        let target = find_overlay_child(&wv).unwrap_or(wv);
        target.set_margin_start(x as i32);
        target.set_margin_top(y as i32);
        target.set_size_request(width as i32, height as i32);
        target.show();
    });
    Ok(())
}

#[tauri::command]
pub fn browser_hide(state: tauri::State<'_, BrowserState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let webview = guard.as_ref().ok_or("browser not created")?;
    let _ = webview.with_webview(|platform| {
        use gtk::prelude::*;
        let wv: gtk::Widget = platform.inner().clone().upcast();
        let target = find_overlay_child(&wv).unwrap_or(wv);
        target.hide();
    });
    Ok(())
}

#[tauri::command]
pub fn browser_get_url(state: tauri::State<'_, BrowserState>) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let webview = guard.as_ref().ok_or("browser not created")?;
    let current = webview.url().map_err(|e| e.to_string())?;
    Ok(current.to_string())
}
