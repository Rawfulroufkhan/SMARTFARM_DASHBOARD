# ============================================================
# SMARTFARM - PLANT DISEASE DETECTION
# PlantVillage - 38 Classes
# Transfer Learning - ResNet18
# ============================================================

import os
import json
import random

import torch
import torch.nn as nn

from torch.utils.data import Dataset, DataLoader

from torchvision import models, transforms
from torchvision.models import ResNet18_Weights

from datasets import load_dataset

from PIL import Image


# ============================================================
# CONFIG
# ============================================================

DATASET_NAME = "geraldmc/plantvillage-full"

DATASET_REVISION = "v0.1.0"

MODEL_DIR = "plant_disease/models"

MODEL_PATH = os.path.join(
    MODEL_DIR,
    "plant_disease_resnet18.pth"
)

CLASSES_PATH = os.path.join(
    MODEL_DIR,
    "classes.json"
)

IMAGE_SIZE = 224

BATCH_SIZE = 32

EPOCHS = 8

LEARNING_RATE = 0.0001

NUM_WORKERS = 0

RANDOM_SEED = 42


# ============================================================
# REPRODUCIBILITY
# ============================================================

random.seed(RANDOM_SEED)

torch.manual_seed(RANDOM_SEED)

if torch.cuda.is_available():
    torch.cuda.manual_seed_all(RANDOM_SEED)


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available()
    else "cpu"
)


print()
print("=" * 70)
print("SMARTFARM PLANT DISEASE AI")
print("=" * 70)

print("Device:", DEVICE)

if torch.cuda.is_available():

    print(
        "GPU:",
        torch.cuda.get_device_name(0)
    )

else:

    print("GPU not detected.")
    print("Training will use CPU.")

print("=" * 70)


# ============================================================
# CREATE MODEL DIRECTORY
# ============================================================

os.makedirs(
    MODEL_DIR,
    exist_ok=True
)


# ============================================================
# LOAD CORRECT IMAGE DATASET
# ============================================================

print()
print("Loading PlantVillage image dataset...")
print()
print("Dataset:", DATASET_NAME)
print("Revision:", DATASET_REVISION)
print()


full_dataset = load_dataset(
    DATASET_NAME,
    revision=DATASET_REVISION,
    split="train"
)


print()
print("Dataset loaded successfully.")
print(full_dataset)


# ============================================================
# VERIFY DATASET
# ============================================================

print()
print("=" * 70)
print("DATASET INFORMATION")
print("=" * 70)

print(
    "Number of images:",
    len(full_dataset)
)

print(
    "Columns:",
    full_dataset.column_names
)


required_columns = [
    "image",
    "class_label"
]


for column in required_columns:

    if column not in full_dataset.column_names:

        raise RuntimeError(
            f"Required column '{column}' "
            f"was not found."
        )


print()
print("Image column: image")
print("Label column: class_label")


# ============================================================
# CHECK FIRST IMAGE
# ============================================================

first_item = full_dataset[0]

print()
print("Checking first image...")

print(
    "Image type:",
    type(first_item["image"])
)

print(
    "Class:",
    first_item["class_label"]
)

if "disease" in first_item:

    print(
        "Disease:",
        first_item["disease"]
    )

if "host" in first_item:

    print(
        "Plant:",
        first_item["host"]
    )


# ============================================================
# FIND ALL CLASSES
# ============================================================

print()
print("Finding disease classes...")


classes = sorted(
    set(
        str(item["class_label"])
        for item in full_dataset
    )
)


NUM_CLASSES = len(classes)


print()
print("=" * 70)
print("NUMBER OF CLASSES:", NUM_CLASSES)
print("=" * 70)


for index, class_name in enumerate(classes):

    print(
        f"{index:02d} -> {class_name}"
    )


if NUM_CLASSES != 38:

    print()
    print(
        "WARNING: Expected 38 classes "
        f"but found {NUM_CLASSES}."
    )


# ============================================================
# LABEL MAPPING
# ============================================================

class_to_index = {

    class_name: index

    for index, class_name in enumerate(classes)

}


index_to_class = {

    index: class_name

    for index, class_name in enumerate(classes)

}


# ============================================================
# SAVE CLASS INFORMATION
# ============================================================

with open(
    CLASSES_PATH,
    "w",
    encoding="utf-8"
) as file:

    json.dump(

        {
            "classes": classes,
            "class_to_index": class_to_index
        },

        file,

        indent=4,

        ensure_ascii=False
    )


print()
print(
    "Class mapping saved:"
)

print(
    CLASSES_PATH
)


# ============================================================
# USE DATASET'S OFFICIAL TRAIN/TEST SPLIT
# ============================================================

print()
print("=" * 70)
print("CREATING TRAIN / VALIDATION SPLIT")
print("=" * 70)


if "split" not in full_dataset.column_names:

    raise RuntimeError(
        "Dataset does not contain the "
        "'split' column."
    )


train_data = full_dataset.filter(
    lambda x: x["split"] == "train"
)


validation_data = full_dataset.filter(
    lambda x: x["split"] == "test"
)


print()
print(
    "Training images:",
    len(train_data)
)

print(
    "Validation images:",
    len(validation_data)
)


# ============================================================
# TRANSFORMS
# ============================================================

train_transform = transforms.Compose([

    transforms.Resize(
        (IMAGE_SIZE, IMAGE_SIZE)
    ),

    transforms.RandomHorizontalFlip(
        p=0.5
    ),

    transforms.RandomRotation(
        15
    ),

    transforms.ColorJitter(
        brightness=0.2,
        contrast=0.2,
        saturation=0.2
    ),

    transforms.ToTensor(),

    transforms.Normalize(

        mean=[
            0.485,
            0.456,
            0.406
        ],

        std=[
            0.229,
            0.224,
            0.225
        ]
    )
])


validation_transform = transforms.Compose([

    transforms.Resize(
        (IMAGE_SIZE, IMAGE_SIZE)
    ),

    transforms.ToTensor(),

    transforms.Normalize(

        mean=[
            0.485,
            0.456,
            0.406
        ],

        std=[
            0.229,
            0.224,
            0.225
        ]
    )
])


# ============================================================
# PYTORCH DATASET
# ============================================================

class PlantDiseaseDataset(Dataset):

    def __init__(
        self,
        dataset,
        transform=None
    ):

        self.dataset = dataset

        self.transform = transform


    def __len__(self):

        return len(self.dataset)


    def __getitem__(
        self,
        index
    ):

        item = self.dataset[index]

        image = item["image"]

        label = str(
            item["class_label"]
        )


        # Ensure RGB

        if not isinstance(
            image,
            Image.Image
        ):

            image = Image.fromarray(
                image
            )


        image = image.convert(
            "RGB"
        )


        if self.transform:

            image = self.transform(
                image
            )


        label_index = class_to_index[
            label
        ]


        return (
            image,
            label_index
        )


# ============================================================
# CREATE PYTORCH DATASETS
# ============================================================

print()
print("Preparing PyTorch datasets...")


train_dataset = PlantDiseaseDataset(

    train_data,

    train_transform
)


validation_dataset = PlantDiseaseDataset(

    validation_data,

    validation_transform
)


print(
    "Training samples:",
    len(train_dataset)
)

print(
    "Validation samples:",
    len(validation_dataset)
)


# ============================================================
# DATA LOADERS
# ============================================================

train_loader = DataLoader(

    train_dataset,

    batch_size=BATCH_SIZE,

    shuffle=True,

    num_workers=NUM_WORKERS,

    pin_memory=torch.cuda.is_available()
)


validation_loader = DataLoader(

    validation_dataset,

    batch_size=BATCH_SIZE,

    shuffle=False,

    num_workers=NUM_WORKERS,

    pin_memory=torch.cuda.is_available()
)


# ============================================================
# LOAD RESNET18
# ============================================================

print()
print("=" * 70)
print("LOADING PRETRAINED RESNET18")
print("=" * 70)


weights = ResNet18_Weights.DEFAULT


model = models.resnet18(
    weights=weights
)


# ============================================================
# FREEZE BACKBONE
# ============================================================

print(
    "Freezing ResNet18 backbone..."
)


for parameter in model.parameters():

    parameter.requires_grad = False


# ============================================================
# REPLACE FINAL CLASSIFIER
# ============================================================

input_features = model.fc.in_features


model.fc = nn.Sequential(

    nn.Dropout(
        p=0.3
    ),

    nn.Linear(

        input_features,

        NUM_CLASSES
    )
)


model = model.to(
    DEVICE
)


# ============================================================
# LOSS
# ============================================================

criterion = nn.CrossEntropyLoss()


# ============================================================
# OPTIMIZER
# ============================================================

optimizer = torch.optim.Adam(

    model.fc.parameters(),

    lr=LEARNING_RATE
)


# ============================================================
# TRAIN
# ============================================================

def train_one_epoch():

    model.train()

    total_loss = 0.0

    correct = 0

    total = 0


    for images, labels in train_loader:

        images = images.to(
            DEVICE,
            non_blocking=True
        )

        labels = labels.to(
            DEVICE,
            non_blocking=True
        )


        optimizer.zero_grad()


        outputs = model(
            images
        )


        loss = criterion(

            outputs,

            labels
        )


        loss.backward()

        optimizer.step()


        total_loss += (

            loss.item()
            * images.size(0)

        )


        predictions = (

            outputs.argmax(
                dim=1
            )

        )


        total += labels.size(0)


        correct += (

            predictions == labels

        ).sum().item()


    average_loss = (

        total_loss / total

    )


    accuracy = (

        100.0 * correct / total

    )


    return (
        average_loss,
        accuracy
    )


# ============================================================
# VALIDATION
# ============================================================

def validate():

    model.eval()

    total_loss = 0.0

    correct = 0

    total = 0


    with torch.no_grad():

        for images, labels in validation_loader:

            images = images.to(
                DEVICE,
                non_blocking=True
            )

            labels = labels.to(
                DEVICE,
                non_blocking=True
            )


            outputs = model(
                images
            )


            loss = criterion(

                outputs,

                labels
            )


            total_loss += (

                loss.item()
                * images.size(0)

            )


            predictions = (

                outputs.argmax(
                    dim=1
                )

            )


            total += labels.size(0)


            correct += (

                predictions == labels

            ).sum().item()


    average_loss = (

        total_loss / total

    )


    accuracy = (

        100.0 * correct / total

    )


    return (
        average_loss,
        accuracy
    )


# ============================================================
# TRAINING LOOP
# ============================================================

print()
print("=" * 70)
print("STARTING TRANSFER LEARNING")
print("=" * 70)


best_accuracy = 0.0


for epoch in range(
    EPOCHS
):

    print()
    print(
        f"Epoch {epoch + 1}/{EPOCHS}"
    )

    print(
        "-" * 60
    )


    train_loss, train_accuracy = (
        train_one_epoch()
    )


    validation_loss, validation_accuracy = (
        validate()
    )


    print(
        f"Train Loss: "
        f"{train_loss:.4f}"
    )


    print(
        f"Train Accuracy: "
        f"{train_accuracy:.2f}%"
    )


    print(
        f"Validation Loss: "
        f"{validation_loss:.4f}"
    )


    print(
        f"Validation Accuracy: "
        f"{validation_accuracy:.2f}%"
    )


    # ========================================================
    # SAVE BEST MODEL
    # ========================================================

    if validation_accuracy > best_accuracy:

        best_accuracy = (
            validation_accuracy
        )


        torch.save(

            {

                "model_state_dict":
                    model.state_dict(),

                "num_classes":
                    NUM_CLASSES,

                "classes":
                    classes,

                "image_size":
                    IMAGE_SIZE,

                "model_name":
                    "resnet18",

            },

            MODEL_PATH
        )


        print()
        print(
            "BEST MODEL SAVED!"
        )


        print(
            f"Accuracy: "
            f"{best_accuracy:.2f}%"
        )


# ============================================================
# COMPLETE
# ============================================================

print()
print("=" * 70)
print("TRAINING COMPLETE")
print("=" * 70)


print(
    f"Best validation accuracy: "
    f"{best_accuracy:.2f}%"
)


print()
print(
    "Model saved to:"
)

print(
    MODEL_PATH
)


print()
print(
    "Classes saved to:"
)

print(
    CLASSES_PATH
)


print()
print(
    "Number of classes:",
    NUM_CLASSES
)


print()
print("=" * 70)
print("PLANT DISEASE MODEL READY")
print("=" * 70)