// Executado em Python 3.11 separado para não bloquear o Electron.
// Usa o finetune oficial Chatterbox Multilingual V3 PT-BR e voz de referência brasileira.
// stdout é um protocolo JSONL; logs são enviados exclusivamente a stderr.
export const chatterboxPython = String.raw`
import base64
import io
import json
import os
import sys
import time
import wave
from pathlib import Path

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(os.environ["POLITRON_CHATTERBOX_ROOT"])
VENDOR = ROOT / "chatterbox-ptbr-code" / "chatterbox" / "src"
sys.path.insert(0, str(VENDOR))
os.environ["HF_HOME"] = str(ROOT / "chatterbox-cache")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
MODEL_REPO = "ResembleAI/Chatterbox-Multilingual-pt-br"
BASE_REPO = "ResembleAI/chatterbox"
REF_AUDIO = ROOT / "chatterbox-reference-ptbr.wav"
SAMPLE_URL = "https://storage.googleapis.com/chatterbox-demo-samples/mtl-v3-single-language-prompts/pt-br/pt_br_f2.wav"

def ready():
    try:
        import torch
        import chatterbox.tts
        from huggingface_hub import try_to_load_from_cache
        base = ["ve.pt", "conds.pt", "grapheme_mtl_merged_expanded_v1.json"]
        ptbr = ["t3_pt_br.safetensors", "s3gen_v3.pt"]
        paths = [try_to_load_from_cache(BASE_REPO, name) for name in base]
        paths += [try_to_load_from_cache(MODEL_REPO, name) for name in ptbr]
        return all(isinstance(p, str) and Path(p).is_file() for p in paths) and REF_AUDIO.is_file()
    except Exception:
        return False

def install():
    from huggingface_hub import snapshot_download
    import urllib.request
    base_files = ["ve.pt", "conds.pt", "grapheme_mtl_merged_expanded_v1.json"]
    ptbr_files = ["t3_pt_br.safetensors", "s3gen_v3.pt"]
    print("Baixando arquivos compartilhados do Chatterbox...", file=sys.stderr, flush=True)
    snapshot_download(repo_id=BASE_REPO, allow_patterns=base_files)
    print("Baixando os pesos dedicados a português brasileiro (cerca de 3,2 GB)...", file=sys.stderr, flush=True)
    snapshot_download(repo_id=MODEL_REPO, allow_patterns=ptbr_files)
    if not REF_AUDIO.is_file():
        print("Baixando amostra de referência PT-BR...", file=sys.stderr, flush=True)
        urllib.request.urlretrieve(SAMPLE_URL, REF_AUDIO)
    if not ready():
        raise RuntimeError("A instalação dos arquivos do Chatterbox está incompleta.")
    print(json.dumps({"ok": True, "installed": True}), flush=True)

_model = None
def get_model():
    global _model
    if _model is None:
        import torch
        torch.set_num_threads(min(6, max(1, os.cpu_count() or 2)))
        from chatterbox.tts import ChatterboxTTS
        print("Carregando Chatterbox PT-BR na CPU...", file=sys.stderr, flush=True)
        _model = ChatterboxTTS.from_pretrained("cpu")
        print("Modelo Chatterbox pronto.", file=sys.stderr, flush=True)
    return _model

def synthesize(text, speed=1.0):
    import torch
    if not isinstance(text, str) or not text.strip() or len(text) > 450:
        raise ValueError("Envie até 450 caracteres para a síntese PT-BR.")
    start = time.monotonic()
    model = get_model()
    with torch.inference_mode():
        result = model.generate(
            text.strip(), language_id="pt", audio_prompt_path=str(REF_AUDIO),
            exaggeration=0.55, cfg_weight=0.4, temperature=0.8
        )
    samples = result.detach().float().cpu().reshape(-1).numpy()
    # Resampling ingênuo altera ligeiramente o tom; mantenha a voz natural na velocidade padrão.
    if speed != 1 and speed >= 0.75 and speed <= 1.5:
        import numpy as np
        src = np.arange(len(samples))
        dst = np.linspace(0, len(samples) - 1, max(1, round(len(samples) / speed)))
        samples = np.interp(dst, src, samples).astype("float32")
    import numpy as np
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(int(model.sr))
        wav.writeframes(pcm.tobytes())
    return output.getvalue(), round(time.monotonic() - start, 2)

def serve():
    for line in sys.stdin:
        request_id = None
        try:
            req = json.loads(line)
            request_id = req.get("id")
            wav, elapsed = synthesize(req["text"], float(req.get("speed", 1)))
            if len(wav) > 16 * 1024 * 1024:
                raise ValueError("Áudio gerado muito grande.")
            response = {"id": request_id, "wav": base64.b64encode(wav).decode("ascii"), "seconds": elapsed}
        except Exception as error:
            response = {"id": request_id, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else "serve"
        if mode == "status":
            print(json.dumps({"ok": ready()}), flush=True)
        elif mode == "install":
            install()
        elif mode == "serve":
            serve()
        else:
            raise ValueError("Modo inválido.")
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        sys.exit(1)
`
