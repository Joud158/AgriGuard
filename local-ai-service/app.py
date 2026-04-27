import base64
import io
import os
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from PIL import Image
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
from qwen_vl_utils import process_vision_info

QWEN_MODEL_ID = (
    os.getenv("LOCAL_QWEN_MODEL_PATH")
    or os.getenv("LOCAL_QWEN_MODEL")
    or "./models/Qwen2.5-VL-3B-Instruct"
)

app = FastAPI(title="AgriGuard Local Qwen Crop Vision Service")

_processor = None
_model = None


class ImagePayload(BaseModel):
    imageBase64: str = Field(..., min_length=10)
    mimeType: Optional[str] = "image/jpeg"
    crop: Optional[str] = ""
    symptoms: Optional[str] = ""


def normalize(value) -> str:
    return str(value or "").strip()


def decode_image(image_base64: str) -> Image.Image:
    try:
        raw = normalize(image_base64)

        if raw.startswith("data:"):
            raw = raw.split(",", 1)[-1]

        image_bytes = base64.b64decode(raw)
        return Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image data") from exc


def image_to_small_data_url(image: Image.Image, max_size: int = 224) -> str:
    image = image.copy()
    image.thumbnail((max_size, max_size))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=75, optimize=True)

    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded}"


def guess_severity(answer: str) -> str:
    text = normalize(answer).lower()

    if any(
        word in text
        for word in [
            "healthy",
            "no visible disease",
            "no clear disease",
            "minor",
            "normal",
        ]
    ):
        return "Low"

    if any(
        word in text
        for word in [
            "severe",
            "urgent",
            "spreading",
            "many plants",
            "blight",
            "rust",
            "rot",
            "mildew",
            "bacterial",
            "virus",
            "leaf spot",
            "spots",
            "lesion",
            "lesions",
            "yellowing",
            "wilting",
            "disease",
            "fungal",
            "infection",
        ]
    ):
        return "High"

    return "Medium"


def load_model():
    global _processor, _model

    if _processor is None or _model is None:
        print(f"[AI] Loading Qwen model from: {QWEN_MODEL_ID}")

        _processor = AutoProcessor.from_pretrained(
            QWEN_MODEL_ID,
            trust_remote_code=True,
            local_files_only=True,
        )

        if torch.cuda.is_available():
            _model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                QWEN_MODEL_ID,
                torch_dtype=torch.float16,
                device_map="auto",
                trust_remote_code=True,
                local_files_only=True,
            )
        else:
            _model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                QWEN_MODEL_ID,
                torch_dtype=torch.float32,
                trust_remote_code=True,
                local_files_only=True,
            )
            _model.to("cpu")

        _model.eval()
        print("[AI] Qwen model loaded successfully.")

    return _processor, _model


def build_prompt(question: str, crop: str) -> str:
    crop_context = (
        f"The farmer says the crop is: {crop}."
        if crop
        else "The crop type is not provided."
    )

    farmer_question = question or "What is wrong and what should I do?"

    return (
        "You are AgriGuard AI Crop Doctor. Look at the crop/leaf image and answer briefly.\n"
        f"{crop_context}\n"
        f"Farmer question: {farmer_question}\n\n"
        "Do not give a final diagnosis from one photo. "
        "Do not recommend chemicals, dosages, or removing/destroying plants.\n\n"
        "Answer exactly:\n"
        "Likely issue: short phrase.\n"
        "What I can see: short sentence.\n"
        "What to do now: inspect nearby leaves, take close and wide photos, and monitor spreading.\n"
        "When to request an agronomist: short sentence.\n"
    )


@app.get("/health")
def health():
    return {
        "success": True,
        "mode": "qwen",
        "model": QWEN_MODEL_ID,
        "status": "ok",
    }


@app.post("/analyze-image")
def analyze_image(payload: ImagePayload):
    image = decode_image(payload.imageBase64)

    # Physically compress the uploaded image before Qwen sees it.
    # This is important for CPU/integrated-GPU laptops.
    data_url = image_to_small_data_url(image, max_size=224)

    processor, model = load_model()
    prompt = build_prompt(normalize(payload.symptoms), normalize(payload.crop))

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "image": data_url,
                },
                {
                    "type": "text",
                    "text": prompt,
                },
            ],
        }
    ]

    try:
        print("[AI] Starting Qwen inference...")

        text = processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        image_inputs, video_inputs = process_vision_info(messages)

        inputs = processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        )

        device = next(model.parameters()).device
        inputs = inputs.to(device)

        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=70,
                do_sample=False,
            )

        generated_ids_trimmed = [
            output_ids[len(input_ids):]
            for input_ids, output_ids in zip(inputs.input_ids, generated_ids)
        ]

        answer = processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0].strip()

        print("[AI] Qwen inference completed.")

        return {
            "success": True,
            "model": str(QWEN_MODEL_ID),
            "label": "Qwen visual crop-health advisory",
            "severity": guess_severity(answer),
            "confidence": 0,
            "answer": answer,
            "nextSteps": [],
            "interpretationNote": (
                "This answer is generated by Qwen2.5-VL from the uploaded image and your question. "
                "It is not a confirmed diagnosis. Confirm treatment decisions with an agronomist."
            ),
        }

    except Exception as exc:
        print(f"[AI] Qwen inference failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Qwen inference failed: {exc}") from exc