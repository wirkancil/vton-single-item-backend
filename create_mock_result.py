#!/usr/bin/env python3
"""
Create a mock VTON result image by combining model and garment images
"""

from PIL import Image
import os

def create_mock_result():
    """Create a mock result by combining model and garment images"""
    try:
        # Open images
        model_img = Image.open("model.png")
        garment_img = Image.open("germent.png")

        # Resize garment to be smaller (like an overlay)
        model_width, model_height = model_img.size
        garment_img = garment_img.resize((model_width // 2, model_height // 2))

        # Create a new image with the same size as model
        result_img = model_img.copy()

        # Paste garment image on top-right corner (simulating virtual try-on)
        garment_width, garment_height = garment_img.size
        position = (model_width - garment_width - 50, 50)  # Top-right with some padding

        # Use garment as a simple overlay (in real VTON, this would be more sophisticated)
        result_img.paste(garment_img, position, garment_img if garment_img.mode == 'RGBA' else None)

        # Save the result
        result_img.save("result.png")
        print("✅ Mock result image created: result.png")
        return True

    except Exception as e:
        print(f"❌ Failed to create mock result: {e}")
        return False

if __name__ == "__main__":
    create_mock_result()