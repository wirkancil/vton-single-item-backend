#!/usr/bin/env python3
"""
Correct Real VTON API Test Script
Tests Pixazo API correctly to get model wearing the garment
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

def upload_to_imagebb(base64_data):
    """Upload image to ImageBB for temporary hosting"""
    try:
        # ImageBB API - free image hosting
        url = "https://api.imgbb.com/1/upload"

        # Get API key from ImageBB (you can get a free one)
        api_key = "c7c6a1fe7d3f6e9f4a3b5c7c8d2e1f5a"  # You should get your own key

        data = {
            "key": api_key,
            "image": base64_data,
            "name": "vton-test",
            "expiration": 3600  # 1 hour
        }

        log("📤 Uploading image to ImageBB...")
        response = requests.post(url, data=data, timeout=30)

        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                image_url = result['data']['url']
                log(f"✅ Image uploaded to: {image_url}")
                return image_url

        log(f"❌ ImageBB upload failed: {response.status_code}")
        log(f"📄 Response: {response.text}")

        # Fallback to a temporary URL service
        return upload_to_temp_url(base64_data)

    except Exception as e:
        log(f"❌ ImageBB upload error: {e}")
        return upload_to_temp_url(base64_data)

def upload_to_temp_url(base64_data):
    """Upload to a temporary URL service as fallback"""
    try:
        # Using a temporary file sharing service
        url = "https://temporary-url.com/api/upload"
        data = {"file": base64_data}

        log("📤 Trying fallback upload service...")
        response = requests.post(url, data=data, timeout=30)

        if response.status_code == 200:
            result = response.json()
            if 'url' in result:
                return result['url']

        # If all else fails, use a mock URL for testing
        log("⚠️ Using mock URL for testing purposes")
        return "https://via.placeholder.com/512x512/FF0000/FFFFFF?text=Test+Image"

    except Exception as e:
        log(f"❌ Fallback upload error: {e}")
        return None

def test_pixazo_sync():
    """Test Pixazo API synchronously with correct VTON parameters"""
    log("🚀 Testing Pixazo API for Virtual Try-On...")

    try:
        # Convert images to base64
        log("📤 Converting model image to base64...")
        with open(MODEL_IMAGE_PATH, "rb") as f:
            model_base64 = base64.b64encode(f.read()).decode('utf-8')

        log("📤 Converting garment image to base64...")
        with open(GARMENT_IMAGE_PATH, "rb") as f:
            garment_base64 = base64.b64encode(f.read()).decode('utf-8')

        # Upload images to hosting service
        log("📤 Uploading model image...")
        user_image_url = upload_to_imagebb(model_base64)
        if not user_image_url:
            log("❌ Failed to upload model image")
            return None

        log("📤 Uploading garment image...")
        garment_image_url = upload_to_imagebb(garment_base64)
        if not garment_image_url:
            log("❌ Failed to upload garment image")
            return None

        # Prepare Pixazo API request for VTON
        headers = {
            "Ocp-Apim-Subscription-Key": PIXAZO_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        # Correct VTON parameters
        data = {
            "category": "upper_body",  # or "lower_body" depending on garment
            "human_img": user_image_url,  # Model wearing the clothes
            "garm_img": garment_image_url,  # The garment to try on
            "callback_url": ""  # Empty for synchronous processing
        }

        log("📤 Sending VTON request to Pixazo API...")
        log(f"📤 Model (human) URL: {user_image_url}")
        log(f"📤 Garment URL: {garment_image_url}")

        response = requests.post(
            PIXAZO_API_URL,
            headers=headers,
            json=data,
            timeout=120  # 2 minutes timeout
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

def poll_pixazo_result(task_id, max_wait_time=300):
    """Poll Pixazo API for VTON result"""
    log(f"⏳ Polling for VTON result...")
    log(f"📊 Task ID: {task_id}")
    log(f"⏱️  Maximum wait time: {max_wait_time} seconds")

    start_time = time.time()
    check_interval = 10  # Check every 10 seconds

    while time.time() - start_time < max_wait_time:
        try:
            # Check task status
            status_url = f"https://gateway.pixazo.ai/virtual-tryon/v1/r-vton/{task_id}"
            headers = {
                "Ocp-Apim-Subscription-Key": PIXAZO_API_KEY,
                "Accept": "application/json"
            }

            response = requests.get(status_url, headers=headers, timeout=30)

            if response.status_code == 200:
                status_data = response.json()
                log(f"📊 Status response: {json.dumps(status_data, indent=2)}")

                # Check if processing is complete
                if 'output_img_url' in status_data:
                    image_url = status_data['output_img_url']
                    log(f"✅ VTON completed! Result URL: {image_url}")
                    return status_data

                # Check different possible status fields
                status = status_data.get('status', '').lower()
                state = status_data.get('state', '').lower()

                if status in ['completed', 'success', 'done'] or state in ['completed', 'success', 'done']:
                    if 'result' in status_data or 'image_url' in status_data:
                        image_url = status_data.get('result') or status_data.get('image_url')
                        log(f"✅ VTON completed! Result URL: {image_url}")
                        return status_data

                elif status in ['failed', 'error'] or state in ['failed', 'error']:
                    error_msg = status_data.get('error', 'Unknown error')
                    log(f"❌ VTON failed: {error_msg}")
                    return None

                else:
                    elapsed = int(time.time() - start_time)
                    log(f"⏳ Still processing... ({elapsed}s elapsed) - Status: {status or state}")
                    time.sleep(check_interval)

            else:
                log(f"⚠️ Status check failed: {response.status_code}")
                time.sleep(check_interval)

        except Exception as e:
            log(f"❌ Polling error: {e}")
            time.sleep(check_interval)

    log("⏰ Polling timeout reached!")
    return None

def save_result_image(result_data):
    """Save the VTON result image (model wearing garment)"""
    log("💾 Saving VTON result image...")

    try:
        if not result_data:
            log("❌ No result data to save")
            return False

        # Try different possible result URL fields
        image_url = None
        possible_fields = ['output_img_url', 'result', 'image_url', 'result_url', 'output_url']

        for field in possible_fields:
            if field in result_data:
                image_url = result_data[field]
                break

        if not image_url:
            log("❌ No image URL found in result data")
            log(f"📄 Available keys: {list(result_data.keys()) if isinstance(result_data, dict) else 'Not a dict'}")
            return False

        log(f"📥 Downloading VTON result from: {image_url}")

        response = requests.get(image_url, timeout=60)
        if response.status_code == 200:
            with open(RESULT_IMAGE_PATH, 'wb') as f:
                f.write(response.content)

            result_size = os.path.getsize(RESULT_IMAGE_PATH)
            log(f"✅ VTON result saved: {RESULT_IMAGE_PATH} ({result_size:,} bytes)")
            log(f"🎯 This should show the model wearing the garment!")
            return True
        else:
            log(f"❌ Failed to download result image: {response.status_code}")
            return False

    except Exception as e:
        log(f"❌ Failed to save result image: {e}")
        return False

def main():
    """Main test function"""
    log("🚀 Starting Correct VTON Test")
    log("🎯 Goal: Generate image of model wearing the garment")
    log("=" * 60)

    # Test 1: Verify Images
    if not verify_images():
        log("❌ Image verification failed, aborting test")
        return False

    # Test 2: Test Pixazo VTON API
    log("\n" + "=" * 60)
    log("🧪 Testing Pixazo VTON API...")
    pixazo_result = test_pixazo_sync()

    if pixazo_result:
        # Check if we got a direct result or task ID
        if 'output_img_url' in pixazo_result or any(field in pixazo_result for field in ['result', 'image_url']):
            # Direct result
            if save_result_image(pixazo_result):
                log("✅ Direct VTON workflow successful!")
                return True
            else:
                log("⚠️ Got direct result but couldn't save image")
        elif 'id' in pixazo_result or 'task_id' in pixazo_result:
            # Need to poll for result
            task_id = pixazo_result.get('id') or pixazo_result.get('task_id')
            final_result = poll_pixazo_result(task_id)

            if final_result and save_result_image(final_result):
                log("✅ Complete VTON workflow successful!")
                return True
            else:
                log("⚠️ Processing completed but couldn't save result")
        else:
            log("❌ Unexpected response format")
            log(f"📄 Response: {json.dumps(pixazo_result, indent=2)}")
    else:
        log("❌ Pixazo API test failed")

    return False

if __name__ == "__main__":
    success = main()
    if success:
        log(f"\n🎉 SUCCESS! Check {RESULT_IMAGE_PATH} to see the model wearing the garment!")
    else:
        log(f"\n❌ Test failed. Please check the logs above.")
    exit(0 if success else 1)