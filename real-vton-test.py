#!/usr/bin/env python3
"""
Real VTON API Test Script
Tests the Pixazo API directly with model.png and germent.png to generate real result.png
"""

import requests
import json
import time
import os
import base64
from datetime import datetime

# Configuration from .env
PIXAZO_API_URL = "https://gateway.pixazo.ai/virtual-tryon/v1/r-vton"
PIXAZO_API_KEY = "2a5fc25e7c564fb8ab7c0dff5586299d"

MODEL_IMAGE_PATH = "model.png"
GARMENT_IMAGE_PATH = "germent.png"
RESULT_IMAGE_PATH = "result.png"

def log(message):
    """Print timestamped log message"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")

def verify_images():
    """Verify test images exist and are readable"""
    log("🔍 Verifying test images...")

    if not os.path.exists(MODEL_IMAGE_PATH):
        log(f"❌ Model image not found: {MODEL_IMAGE_PATH}")
        return False

    if not os.path.exists(GARMENT_IMAGE_PATH):
        log(f"❌ Garment image not found: {GARMENT_IMAGE_PATH}")
        return False

    # Check file sizes
    model_size = os.path.getsize(MODEL_IMAGE_PATH)
    garment_size = os.path.getsize(GARMENT_IMAGE_PATH)

    log(f"✅ Model image: {model_size:,} bytes")
    log(f"✅ Garment image: {garment_size:,} bytes")

    return True

def upload_image_to_base64(image_path):
    """Convert image to base64 for upload to image hosting service"""
    try:
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
            base64_string = base64.b64encode(image_data).decode('utf-8')
            return base64_string
    except Exception as e:
        log(f"❌ Failed to convert image to base64: {e}")
        return None

def upload_to_imgur(base64_data):
    """Upload image to Imgur for temporary hosting"""
    try:
        # Imgur API endpoint for anonymous upload
        url = "https://api.imgur.com/3/image"
        headers = {
            "Authorization": "Client-ID 546c25a59c58ad7",  # Public Imgur client ID
        }
        data = {
            "image": base64_data,
            "type": "base64",
            "name": "vton-test.jpg"
        }

        log("📤 Uploading image to Imgur...")
        response = requests.post(url, headers=headers, data=data, timeout=30)

        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                image_url = result['data']['link']
                log(f"✅ Image uploaded to: {image_url}")
                return image_url

        log(f"❌ Imgur upload failed: {response.status_code}")
        return None

    except Exception as e:
        log(f"❌ Imgur upload error: {e}")
        return None

def test_pixazo_direct():
    """Test Pixazo API directly with uploaded image URLs"""
    log("🚀 Testing Pixazo API directly with real images...")

    try:
        # Convert images to base64
        log("📤 Converting model image to base64...")
        model_base64 = upload_image_to_base64(MODEL_IMAGE_PATH)
        if not model_base64:
            return None

        log("📤 Converting garment image to base64...")
        garment_base64 = upload_image_to_base64(GARMENT_IMAGE_PATH)
        if not garment_base64:
            return None

        # Upload images to hosting service
        log("📤 Uploading model image...")
        user_image_url = upload_to_imgur(model_base64)
        if not user_image_url:
            log("❌ Failed to upload model image")
            return None

        log("📤 Uploading garment image...")
        garment_image_url = upload_to_imgur(garment_base64)
        if not garment_image_url:
            log("❌ Failed to upload garment image")
            return None

        # Prepare Pixazo API request
        headers = {
            "Ocp-Apim-Subscription-Key": PIXAZO_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        data = {
            "category": "upper_body",
            "human_img": user_image_url,
            "garm_img": garment_image_url,
            "callback_url": ""
        }

        log("📤 Sending request to Pixazo API...")
        log(f"📤 User image URL: {user_image_url}")
        log(f"📤 Garment image URL: {garment_image_url}")

        response = requests.post(
            PIXAZO_API_URL,
            headers=headers,
            json=data,
            timeout=60
        )

        log(f"📥 Response status: {response.status_code}")

        if response.status_code == 200:
            response_data = response.json()
            log(f"✅ Pixazo API success!")
            log(f"📄 Response data: {json.dumps(response_data, indent=2)}")
            return response_data
        else:
            log(f"❌ Pixazo API error: {response.status_code}")
            log(f"❌ Response text: {response.text}")
            return None

    except Exception as e:
        log(f"❌ Pixazo API test failed: {e}")
        return None

def save_result_image(result_data):
    """Save result image from API response"""
    log("💾 Saving result image...")

    try:
        if not result_data:
            log("❌ No result data to save")
            return False

        # Check if result contains image URL
        if 'output_img_url' in result_data:
            image_url = result_data['output_img_url']
            log(f"📥 Downloading result image from: {image_url}")

            response = requests.get(image_url, timeout=60)
            if response.status_code == 200:
                with open(RESULT_IMAGE_PATH, 'wb') as f:
                    f.write(response.content)
                log(f"✅ Result image saved: {RESULT_IMAGE_PATH}")
                return True
            else:
                log(f"❌ Failed to download result image: {response.status_code}")
                return False

        # Check if result contains task ID for polling
        elif 'task_id' in result_data or 'id' in result_data:
            task_id = result_data.get('task_id') or result_data.get('id')
            log(f"📋 Got task ID: {task_id}")
            log("⏳ Polling for result...")

            # Poll for result (max 5 minutes)
            max_attempts = 60  # 5 minutes with 5-second intervals
            for attempt in range(max_attempts):
                time.sleep(5)

                poll_response = requests.get(
                    f"https://gateway.pixazo.ai/virtual-tryon/v1/r-vton/{task_id}",
                    headers={
                        "Ocp-Apim-Subscription-Key": PIXAZO_API_KEY,
                        "Accept": "application/json"
                    },
                    timeout=30
                )

                if poll_response.status_code == 200:
                    poll_data = poll_response.json()
                    status = poll_data.get('status', '')

                    log(f"📊 Attempt {attempt + 1}/{max_attempts} - Status: {status}")

                    if status == 'completed' and 'output_img_url' in poll_data:
                        image_url = poll_data['output_img_url']
                        log(f"✅ Task completed! Downloading from: {image_url}")

                        download_response = requests.get(image_url, timeout=60)
                        if download_response.status_code == 200:
                            with open(RESULT_IMAGE_PATH, 'wb') as f:
                                f.write(download_response.content)
                            log(f"✅ Result image saved: {RESULT_IMAGE_PATH}")
                            return True

                    elif status == 'failed':
                        error_msg = poll_data.get('error', 'Unknown error')
                        log(f"❌ Task failed: {error_msg}")
                        return False

            log("⏰ Polling timeout reached")
            return False

        else:
            log("❌ No image URL or task ID found in result")
            log(f"📄 Available keys: {list(result_data.keys()) if isinstance(result_data, dict) else 'Not a dict'}")
            return False

    except Exception as e:
        log(f"❌ Failed to save result image: {e}")
        return False

def main():
    """Main test function"""
    log("🚀 Starting Real VTON API Test")
    log("=" * 50)

    # Test 1: Verify Images
    if not verify_images():
        log("❌ Image verification failed, aborting test")
        return False

    # Test 2: Test Pixazo API directly
    log("\n" + "=" * 50)
    log("🧪 Testing Real Pixazo API...")
    pixazo_result = test_pixazo_direct()

    if pixazo_result:
        # Try to save result image
        if save_result_image(pixazo_result):
            log("✅ Complete workflow successful!")
        else:
            log("⚠️ Pixazo API worked but couldn't save result image")
    else:
        log("❌ Pixazo API test failed")
        return False

    # Final result
    if os.path.exists(RESULT_IMAGE_PATH):
        result_size = os.path.getsize(RESULT_IMAGE_PATH)
        log(f"✅ Test completed! Real result image: {RESULT_IMAGE_PATH} ({result_size:,} bytes)")
        return True
    else:
        log("❌ Test failed! No result image created")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)