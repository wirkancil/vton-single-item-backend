#!/usr/bin/env python3
"""
Supabase VTON Test Script
Uses Supabase storage to host images and Pixazo API for VTON
"""

import requests
import json
import time
import os
import base64
from datetime import datetime

# Configuration
PIXAZO_API_URL = "https://gateway.pixazo.ai/virtual-tryon/v1/r-vton"
PIXAZO_API_KEY = "2a5fc25e7c564fb8ab7c0dff5586299d"

# Supabase configuration from .env
SUPABASE_URL = "https://nujfrxpgljdfxodnwnem.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51amZyeHBnbGpkZnhvZG53bmVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNDAzMTQsImV4cCI6MjA3NjYxNjMxNH0.QXphCJAddW_VR0-POJfBd94Pv_c_cZpkmO63ZPRZlUk"

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

def upload_to_supabase(image_path, file_name):
    """Upload image to Supabase storage"""
    try:
        # Read image file
        with open(image_path, 'rb') as f:
            file_data = f.read()

        # Generate unique filename
        timestamp = int(time.time())
        unique_filename = f"vton-test/{timestamp}-{file_name}"

        # Upload to Supabase storage
        storage_url = f"{SUPABASE_URL}/storage/v1/object/vton-assets/{unique_filename}"
        headers = {
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "image/png"
        }

        log(f"📤 Uploading {file_name} to Supabase...")
        response = requests.post(storage_url, headers=headers, data=file_data, timeout=30)

        if response.status_code in [200, 201]:
            # Get public URL
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/vton-assets/{unique_filename}"
            log(f"✅ {file_name} uploaded: {public_url}")
            return public_url
        else:
            log(f"❌ Failed to upload {file_name}: {response.status_code}")
            log(f"📄 Response: {response.text}")
            return None

    except Exception as e:
        log(f"❌ Error uploading {file_name} to Supabase: {e}")
        return None

def test_pixazo_vton():
    """Test Pixazo VTON API with Supabase-hosted images"""
    log("🚀 Testing Pixazo VTON with Supabase images...")

    try:
        # Upload images to Supabase
        user_image_url = upload_to_supabase(MODEL_IMAGE_PATH, "model.png")
        if not user_image_url:
            return None

        garment_image_url = upload_to_supabase(GARMENT_IMAGE_PATH, "garment.png")
        if not garment_image_url:
            return None

        # Prepare Pixazo API request
        headers = {
            "Ocp-Apim-Subscription-Key": PIXAZO_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        data = {
            "category": "upper_body",
            "human_img": user_image_url,  # Model photo
            "garm_img": garment_image_url,  # Garment photo
            "callback_url": ""  # Empty for synchronous processing
        }

        log("📤 Sending VTON request to Pixazo API...")
        log(f"📤 Model URL: {user_image_url}")
        log(f"📤 Garment URL: {garment_image_url}")

        response = requests.post(
            PIXAZO_API_URL,
            headers=headers,
            json=data,
            timeout=120
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
        log(f"❌ Pixazo VTON test failed: {e}")
        return None

def wait_for_pixazo_result(task_id, max_wait_time=300):
    """Wait for Pixazo VTON result"""
    log(f"⏳ Waiting for Pixazo VTON result...")
    log(f"📊 Task ID: {task_id}")

    start_time = time.time()
    check_interval = 15  # Check every 15 seconds

    while time.time() - start_time < max_wait_time:
        try:
            status_url = f"https://gateway.pixazo.ai/virtual-tryon/v1/r-vton/{task_id}"
            headers = {
                "Ocp-Apim-Subscription-Key": PIXAZO_API_KEY,
                "Accept": "application/json"
            }

            response = requests.get(status_url, headers=headers, timeout=30)

            if response.status_code == 200:
                status_data = response.json()
                log(f"📊 Status: {json.dumps(status_data, indent=2)}")

                # Check for result image
                if 'output_img_url' in status_data:
                    log("✅ VTON processing completed!")
                    return status_data

                # Check different status indicators
                status = status_data.get('status', '').lower()
                state = status_data.get('state', '').lower()

                if status in ['completed', 'success', 'done'] or state in ['completed', 'success', 'done']:
                    log("✅ VTON processing completed!")
                    return status_data

                elif status in ['failed', 'error'] or state in ['failed', 'error']:
                    error_msg = status_data.get('error', 'Unknown error')
                    log(f"❌ VTON failed: {error_msg}")
                    return None

                else:
                    elapsed = int(time.time() - start_time)
                    log(f"⏳ Processing... ({elapsed}s elapsed) - Status: {status or state}")

            else:
                log(f"⚠️ Status check failed: {response.status_code}")

            time.sleep(check_interval)

        except Exception as e:
            log(f"❌ Polling error: {e}")
            time.sleep(check_interval)

    log("⏰ Timeout reached!")
    return None

def save_result_image(result_data):
    """Save VTON result image"""
    log("💾 Saving VTON result image...")

    try:
        # Find the result image URL
        image_url = None
        possible_fields = ['output_img_url', 'result', 'image_url', 'result_url']

        for field in possible_fields:
            if field in result_data and result_data[field]:
                image_url = result_data[field]
                break

        if not image_url:
            log("❌ No result image URL found")
            log(f"📄 Available data: {list(result_data.keys()) if isinstance(result_data, dict) else 'Not a dict'}")
            return False

        log(f"📥 Downloading result from: {image_url}")

        response = requests.get(image_url, timeout=60)
        if response.status_code == 200:
            with open(RESULT_IMAGE_PATH, 'wb') as f:
                f.write(response.content)

            result_size = os.path.getsize(RESULT_IMAGE_PATH)
            log(f"✅ Result saved: {RESULT_IMAGE_PATH} ({result_size:,} bytes)")
            log(f"🎯 This should show the model wearing the garment!")
            return True
        else:
            log(f"❌ Failed to download result: {response.status_code}")
            return False

    except Exception as e:
        log(f"❌ Failed to save result: {e}")
        return False

def main():
    """Main test function"""
    log("🚀 Starting Supabase VTON Test")
    log("🎯 Goal: Create image of model wearing the garment")
    log("=" * 50)

    # Verify images
    if not verify_images():
        log("❌ Image verification failed")
        return False

    # Test VTON
    log("\n" + "=" * 50)
    log("🧪 Testing VTON process...")
    vton_result = test_pixazo_vton()

    if vton_result:
        # Check if direct result or need to poll
        if 'output_img_url' in vton_result:
            # Direct result
            if save_result_image(vton_result):
                log("✅ Direct VTON success!")
                return True
        elif 'id' in vton_result:
            # Need to poll
            task_id = vton_result['id']
            log(f"📋 Got task ID: {task_id}")

            final_result = wait_for_pixazo_result(task_id)
            if final_result and save_result_image(final_result):
                log("✅ Complete VTON workflow success!")
                return True
            else:
                log("❌ VTON processing failed")
        else:
            log("❌ Unexpected response format")
            log(f"📄 Response: {json.dumps(vton_result, indent=2)}")
    else:
        log("❌ VTON API test failed")

    return False

if __name__ == "__main__":
    success = main()
    if success:
        log(f"\n🎉 SUCCESS! Check {RESULT_IMAGE_PATH}")
        log(f"🎯 You should see the model wearing the garment!")
    else:
        log(f"\n❌ Test failed")
    exit(0 if success else 1)