#!/usr/bin/env python3
"""
VTON Backend v2.0 Deployment Testing Script
Tests model.png + germent.png try-on flow
"""

import requests
import base64
import json
import time
import os
from datetime import datetime

# Configuration
BASE_URL = "https://vton-backend-8yg4xglbb-ancils-projects-f837529c.vercel.app"
GARMENT_ID = "8c532593-713d-48b0-b03c-8cc337812f55"  # From garments endpoint

def read_image_as_base64(filepath):
    """Read image file and convert to base64 data URL"""
    try:
        with open(filepath, "rb") as image_file:
            image_data = image_file.read()
            base64_data = base64.b64encode(image_data).decode('utf-8')

            # Determine file type
            if filepath.endswith('.png'):
                return f"data:image/png;base64,{base64_data}"
            elif filepath.endswith('.jpg') or filepath.endswith('.jpeg'):
                return f"data:image/jpeg;base64,{base64_data}"
            else:
                return f"data:image/png;base64,{base64_data}"
    except Exception as e:
        print(f"❌ Error reading {filepath}: {e}")
        return None

def test_health_check():
    """Test API health"""
    print("🏥 Testing API Health...")

    try:
        response = requests.get(f"{BASE_URL}/api/health")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed: {data['status']}")
            print(f"   Version: {data['version']}")
            print(f"   Environment: {data['environment']}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

def test_garments():
    """Test garments endpoint"""
    print("\n📦 Testing Garments Endpoint...")

    try:
        response = requests.get(f"{BASE_URL}/api/garments")

        if response.status_code == 200:
            data = response.json()
            garments = data['data']
            print(f"✅ Found {len(garments)} garments")

            for garment in garments:
                print(f"   - {garment['name']} ({garment['brand']}) - {garment['category']}")

            return garments
        else:
            print(f"❌ Garments endpoint failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Garments endpoint error: {e}")
        return None

def test_try_on_session(model_image, garment_image):
    """Test creating try-on session"""
    print(f"\n🎭 Creating Try-On Session...")

    try:
        payload = {
            "userImage": model_image,
            "garmentId": GARMENT_ID,
            "userId": "test-user-" + str(int(time.time()))
        }

        print(f"   Garment ID: {GARMENT_ID}")
        print(f"   User image size: {len(model_image)} characters")

        response = requests.post(
            f"{BASE_URL}/api/try-on",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            session_id = data['data']['sessionId']
            status = data['data']['status']

            print(f"✅ Session created successfully!")
            print(f"   Session ID: {session_id}")
            print(f"   Status: {status}")
            print(f"   Processing: {data['data'].get('processing', 'unknown')}")

            return session_id
        else:
            print(f"❌ Try-on session failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Try-on session error: {e}")
        return None

def poll_session_status(session_id, max_wait_time=120):
    """Poll session status until completion"""
    print(f"\n⏳ Polling session status (max wait: {max_wait_time}s)...")

    start_time = time.time()

    while time.time() - start_time < max_wait_time:
        try:
            response = requests.get(f"{BASE_URL}/api/try-on/{session_id}/status")

            if response.status_code == 200:
                data = response.json()
                session_data = data['data']
                status = session_data['status']

                print(f"   Status: {status} (elapsed: {int(time.time() - start_time)}s)")

                if status in ['success', 'completed']:
                    print(f"✅ Processing completed!")
                    print(f"   Result URL: {session_data.get('resultImageUrl', 'N/A')}")
                    return session_data
                elif status == 'failed':
                    print(f"❌ Processing failed!")
                    print(f"   Error: {session_data.get('errorMessage', 'Unknown error')}")
                    return None
                else:
                    print(f"   Still processing... (status: {status})")
                    time.sleep(3)  # Wait 3 seconds before next poll
            else:
                print(f"❌ Status check failed: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Status check error: {e}")
            return None

    print(f"⏱️ Timeout after {max_wait_time} seconds")
    return None

def download_result_image(result_url, filename="result.png"):
    """Download result image"""
    print(f"\n💾 Downloading result image...")

    try:
        response = requests.get(result_url, stream=True)

        if response.status_code == 200:
            with open(filename, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            file_size = os.path.getsize(filename)
            print(f"✅ Result downloaded successfully!")
            print(f"   Filename: {filename}")
            print(f"   File size: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
            return filename
        else:
            print(f"❌ Download failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Download error: {e}")
        return None

def test_new_endpoints():
    """Test new v2.0 endpoints"""
    print(f"\n🆕 Testing V2.0 New Endpoints...")

    # Test models analytics
    try:
        response = requests.get(f"{BASE_URL}/api/models/analytics?userId=test-user")
        print(f"   Models analytics: {'✅' if response.status_code == 200 else '❌'} ({response.status_code})")
    except Exception as e:
        print(f"   Models analytics: ❌ ({e})")

    # Test results gallery
    try:
        response = requests.get(f"{BASE_URL}/api/results/gallery?userId=test-user")
        print(f"   Results gallery: {'✅' if response.status_code == 200 else '❌'} ({response.status_code})")
    except Exception as e:
        print(f"   Results gallery: ❌ ({e})")

    # Test storage usage
    try:
        response = requests.get(f"{BASE_URL}/api/storage/usage?userId=test-user")
        print(f"   Storage usage: {'✅' if response.status_code == 200 else '❌'} ({response.status_code})")
    except Exception as e:
        print(f"   Storage usage: ❌ ({e})")

def main():
    """Main testing function"""
    print("=" * 60)
    print("🚀 VTON Backend v2.0 Deployment Testing")
    print("=" * 60)
    print(f"📅 Testing started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🌐 Target URL: {BASE_URL}")

    # Step 1: Health check
    if not test_health_check():
        print("\n❌ Health check failed. Aborting tests.")
        return

    # Step 2: Test garments
    garments = test_garments()
    if not garments:
        print("\n❌ Garments test failed. Aborting tests.")
        return

    # Step 3: Test new v2.0 endpoints
    test_new_endpoints()

    # Step 4: Load images
    print(f"\n📷 Loading images...")

    model_image = read_image_as_base64("model.png")
    if not model_image:
        print("❌ Failed to load model.png")
        return

    garment_image = read_image_as_base64("germent.png")
    if not garment_image:
        print("❌ Failed to load germent.png")
        return

    print(f"✅ Images loaded successfully")
    print(f"   model.png: {len(model_image)} characters")
    print(f"   germent.png: {len(garment_image)} characters")

    # Step 5: Create try-on session
    session_id = test_try_on_session(model_image, garment_image)
    if not session_id:
        print("\n❌ Failed to create try-on session")
        return

    # Step 6: Poll for results
    result_data = poll_session_status(session_id)
    if not result_data:
        print("\n❌ Processing failed or timed out")
        return

    # Step 7: Download result if available
    result_url = result_data.get('resultImageUrl')
    if result_url:
        result_file = download_result_image(result_url, f"result-{session_id[:8]}.png")
        if result_file:
            print(f"\n🎉 SUCCESS! Complete flow tested successfully!")
            print(f"📊 Summary:")
            print(f"   • Session ID: {session_id}")
            print(f"   • Final Status: {result_data['status']}")
            print(f"   • Result File: {result_file}")
            print(f"   • Processing Time: {datetime.now().strftime('%H:%M:%S')}")
        else:
            print(f"\n⚠️ Session completed but result download failed")
            print(f"   Result URL: {result_url}")
    else:
        print(f"\n⚠️ Session completed but no result URL available")

if __name__ == "__main__":
    main()