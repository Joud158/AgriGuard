from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"
LOCAL_DIR = "./models/Qwen2.5-VL-3B-Instruct"

processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
    MODEL_ID,
    torch_dtype="auto",
    trust_remote_code=True,
)

processor.save_pretrained(LOCAL_DIR)
model.save_pretrained(LOCAL_DIR)

print(f"Downloaded {MODEL_ID} to {LOCAL_DIR}")
