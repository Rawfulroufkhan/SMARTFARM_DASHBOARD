import sys
import json
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image


# ============================================================
# PATHS
# ============================================================

MODEL_PATH = "backend/plant_disease/models/plant_disease_resnet18.pth"
CLASSES_PATH = "backend/plant_disease/models/classes.json"

IMAGE_SIZE = 224


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print("=" * 70)
print("PLANT DISEASE AI - INFERENCE")
print("=" * 70)
print("Device:", DEVICE)


# ============================================================
# LOAD CHECKPOINT
# ============================================================

print("\nLoading checkpoint...")

checkpoint = torch.load(
    MODEL_PATH,
    map_location=DEVICE
)

print("Model:", checkpoint["model_name"])
print("Classes:", checkpoint["num_classes"])
print("Image size:", checkpoint["image_size"])


# ============================================================
# CLASSES
# ============================================================

classes = checkpoint["classes"]

NUM_CLASSES = checkpoint["num_classes"]

print("Number of classes:", NUM_CLASSES)


# ============================================================
# CREATE RESNET18
# ============================================================

print("\nCreating ResNet18...")

model = models.resnet18(weights=None)

input_features = model.fc.in_features

model.fc = nn.Sequential(
    nn.Dropout(p=0.3),
    nn.Linear(
        input_features,
        NUM_CLASSES
    )
)

model = model.to(DEVICE)


# ============================================================
# LOAD TRAINED WEIGHTS
# ============================================================

print("Loading trained weights...")

model.load_state_dict(
    checkpoint["model_state_dict"]
)

model.eval()

print("Model loaded successfully.")


# ============================================================
# IMAGE TRANSFORM
# ============================================================

transform = transforms.Compose([
    transforms.Resize(
        (IMAGE_SIZE, IMAGE_SIZE)
    ),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ============================================================
# PREDICTION FUNCTION
# ============================================================

def predict_image(image_path):

    print("\n" + "=" * 70)
    print("IMAGE:", image_path)
    print("=" * 70)

    image = Image.open(image_path).convert("RGB")

    image_tensor = transform(image)

    image_tensor = image_tensor.unsqueeze(0)

    image_tensor = image_tensor.to(DEVICE)

    with torch.no_grad():

        outputs = model(image_tensor)

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        top_probabilities, top_indices = torch.topk(
            probabilities,
            k=3
        )

    print("\nTOP 3 PREDICTIONS")
    print("-" * 70)

    results = []

    for probability, index in zip(
        top_probabilities[0],
        top_indices[0]
    ):

        class_index = index.item()

        confidence = probability.item() * 100

        class_name = classes[class_index]

        results.append({
            "class": class_name,
            "confidence": confidence
        })

        print(
            f"{class_name:<50} "
            f"{confidence:.2f}%"
        )

    print("-" * 70)

    print(
        f"\nFINAL PREDICTION: "
        f"{results[0]['class']}"
    )

    print(
        f"CONFIDENCE: "
        f"{results[0]['confidence']:.2f}%"
    )

    return results


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    if len(sys.argv) < 2:

        print("\nUsage:")

        print(
            "python backend/plant_disease/predict.py "
            "<image_path>"
        )

        print("\nExample:")

        print(
            "python backend/plant_disease/predict.py "
            "backend/plant_disease/test_images/test.jpg"
        )

        sys.exit(1)

    image_path = sys.argv[1]

    predict_image(image_path)