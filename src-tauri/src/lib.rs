use dotenv::dotenv;
use serde_json::{json, Value};
use std::env;
use std::process::Command;
use tauri::command;

// Die Prompts werden zur Kompilierzeit geladen
const PROMPT_AUFTRAG: &str = include_str!("../../src/prompts/PromptAuftrag.txt");
const PROMPT_RECHNUNG: &str = include_str!("../../src/prompts/PromptRechnung.txt");

#[command]
async fn analyze_document(path: String, doc_type: String) -> Result<Value, String> {
    dotenv().ok();
    let api_key = env::var("MISTRAL_API_KEY").map_err(|_| "API Key fehlt")?;

    // --- ÄNDERUNG: pdftotext statt pdf_oxide ---
    // Wir nutzen -layout, um die Tabellenstruktur visuell zu erhalten
    // Wir nutzen -enc UTF-8 für korrekte Sonderzeichen
    // "-" am Ende sorgt dafür, dass der Output direkt zurückgegeben wird (stdout)
    let output = Command::new("pdftotext")
        .args(&["-layout", "-enc", "UTF-8", &path, "-"])
        .output()
        .map_err(|e| format!("Konnte pdftotext nicht ausführen: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Fehler beim Lesen der PDF (pdftotext): {}",
            err_msg
        ));
    }

    let extracted_text = String::from_utf8_lossy(&output.stdout).to_string();

    // Debugging: Zeigt dir im Terminal exakt, was die KI sehen wird
    println!(
        "--- DEBUG TEXT START ---\n{}\n--- DEBUG TEXT END ---",
        extracted_text
    );

    // Prompt Auswahl
    let base_prompt = if doc_type == "rechnung" {
        PROMPT_RECHNUNG
    } else {
        PROMPT_AUFTRAG
    };

    // Prompt zusammenbauen
    let full_prompt = format!("{}\n\nDokument Inhalt:\n{}", base_prompt, extracted_text);

    let client = reqwest::Client::new();
    let body = json!({
        "model": "mistral-large-latest",
        "messages": [
            { "role": "user", "content": full_prompt }
        ],
        "response_format": { "type": "json_object" }
    });

    // Anfrage an Mistral
    let res = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("API Fehler: {}", res.status()));
    }

    let json_res: Value = res.json().await.map_err(|e| e.to_string())?;

    let content_str = json_res["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Kein Inhalt in der Antwort")?;

    // JSON Parsing
    let result_obj: Value =
        serde_json::from_str(content_str).map_err(|e| format!("JSON Parse Fehler: {}", e))?;

    Ok(result_obj)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![analyze_document])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
