import json
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

MODEL_PATH = MODEL_DIR / "plant_disease_resnet18.pth"
CLASSES_PATH = MODEL_DIR / "classes.json"


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

print(f"[Disease AI] Device: {DEVICE}")


# ============================================================
# LOAD CHECKPOINT
# ============================================================

print("[Disease AI] Loading checkpoint...")

checkpoint = torch.load(
    MODEL_PATH,
    map_location=DEVICE
)

classes = checkpoint["classes"]
image_size = checkpoint.get("image_size", 224)

NUM_CLASSES = len(classes)

print(f"[Disease AI] Classes: {NUM_CLASSES}")
print(f"[Disease AI] Image size: {image_size}")


# ============================================================
# CREATE RESNET18
# ============================================================

print("[Disease AI] Creating ResNet18...")

model = models.resnet18(weights=None)

input_features = model.fc.in_features

model.fc = nn.Sequential(
    nn.Dropout(p=0.3),
    nn.Linear(input_features, NUM_CLASSES)
)


# ============================================================
# LOAD TRAINED WEIGHTS
# ============================================================

model.load_state_dict(
    checkpoint["model_state_dict"]
)

model = model.to(DEVICE)
model.eval()

print("[Disease AI] Model loaded successfully.")


# ============================================================
# IMAGE TRANSFORM
# ============================================================

transform = transforms.Compose([
    transforms.Resize((image_size, image_size)),
    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ============================================================
# PREDICTION FUNCTION
# ============================================================

def predict_image(image):
    """
    Predict plant disease from a PIL image.

    Returns:
        {
            "disease": "...",
            "confidence": 0.85,
            "top_predictions": [...]
        }
    """

    if not isinstance(image, Image.Image):
        raise TypeError("image must be a PIL Image")

    # Convert to RGB
    image = image.convert("RGB")

    # Preprocess
    tensor = transform(image)

    # Add batch dimension
    tensor = tensor.unsqueeze(0)

    # Move to CPU/GPU
    tensor = tensor.to(DEVICE)

    # Inference
    with torch.no_grad():

        outputs = model(tensor)

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        top_probabilities, top_indices = torch.topk(
            probabilities,
            k=min(3, NUM_CLASSES),
            dim=1
        )

    # Convert to Python
    top_probabilities = top_probabilities[0].cpu().tolist()
    top_indices = top_indices[0].cpu().tolist()

    top_predictions = []

    for probability, index in zip(
        top_probabilities,
        top_indices
    ):

        top_predictions.append({
            "disease": classes[index],
            "confidence": round(
                probability * 100,
                2
            )
        })

    # Highest prediction
    best_prediction = top_predictions[0]

    return {
        "disease": best_prediction["disease"],
        "confidence": best_prediction["confidence"],
        "top_predictions": top_predictions
    }


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    print()
    print("=" * 70)
    print("PLANT DISEASE MODEL TEST")
    print("=" * 70)

    print("Model:", MODEL_PATH)
    print("Classes:", NUM_CLASSES)
    print("Device:", DEVICE)

    print()
    print("Model ready.")