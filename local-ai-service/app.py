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
    or "Qwen/Qwen2.5-VL-3B-Instruct"
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


def to_data_url(image_base64: str, mime_type: str = "image/jpeg") -> str:
    raw = normalize(image_base64)

    if raw.startswith("data:"):
        return raw

    return f"data:{mime_type or 'image/jpeg'};base64,{raw}"


def validate_image(image_base64: str) -> None:
    try:
        raw = normalize(image_base64).split(",", 1)[-1]
        image_bytes = base64.b64decode(raw)
        Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image data") from exc


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
        _processor = AutoProcessor.from_pretrained(
            QWEN_MODEL_ID,
            trust_remote_code=True,
        )

        if torch.cuda.is_available():
            _model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                QWEN_MODEL_ID,
                torch_dtype=torch.float16,
                device_map="auto",
                trust_remote_code=True,
            )
        else:
            _model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                QWEN_MODEL_ID,
                torch_dtype=torch.float32,
                trust_remote_code=True,
            )
            _model.to("cpu")

        _model.eval()

    return _processor, _model


def build_prompt(question: str, crop: str) -> str:
    crop_context = (
        f"The farmer says the crop is: {crop}."
        if crop
        else "The crop type is not provided."
    )

    farmer_question = question or "What is wrong and what should I do?"

    return (
        "You are AgriGuard AI Crop Doctor. Analyze the uploaded crop or leaf image and answer the farmer.\n"
        f"{crop_context}\n"
        f"Farmer question: {farmer_question}\n\n"
        "Rules:\n"
        "- Do not claim a final diagnosis from one photo.\n"
        "- Do not invent the crop type if it is unclear.\n"
        "- Do not recommend pesticide, herbicide, chemical, dosage, or treatment.\n"
        "- Do not tell the farmer to remove leaves or destroy plants unless an agronomist confirms.\n"
        "- Give practical inspection and documentation steps.\n"
        "- Keep the answer short, complete, and useful.\n\n"
        "Use exactly this format:\n"
        "Likely issue: one short sentence.\n"
        "What I can see: one short sentence.\n"
        "What to do now: 3 numbered inspection/documentation steps.\n"
        "When to request an agronomist: one short sentence.\n"
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
    validate_image(payload.imageBase64)

    processor, model = load_model()

    data_url = to_data_url(payload.imageBase64, payload.mimeType or "image/jpeg")
    prompt = build_prompt(normalize(payload.symptoms), normalize(payload.crop))

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "image": data_url,
                    "resized_height": 448,
                    "resized_width": 448,
                },
                {
                    "type": "text",
                    "text": prompt,
                },
            ],
        }
    ]

    try:
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
                max_new_tokens=150,
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

        severity = guess_severity(answer)

        return {
            "success": True,
            "model": str(QWEN_MODEL_ID),
            "label": "Qwen visual crop-health advisory",
            "severity": severity,
            "confidence": 0,
            "answer": answer,
            "nextSteps": [],
            "interpretationNote": (
                "This answer is generated by Qwen2.5-VL from the uploaded image and your question. "
                "It is not a confirmed diagnosis. Confirm treatment decisions with an agronomist."
            ),
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Qwen inference failed: {exc}") from exc