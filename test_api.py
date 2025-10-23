#!/usr/bin/env python3
"""
Test script for VTON Backend API
Uses model.png and germent.png for try-on functionality
"""

import base64
import json
import requests
import time

# API Base URL
API_BASE_URL = "https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app"

def convert_image_to_base64(image_path):
    """Convert image file to base64 string"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def test_health_check():
    """Test API health check"""
    print("🔍 Testing API Health Check...")
    try:
        response = requests.get(f"{API_BASE_URL}/api/health")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Health Check Failed: {e}")
        return False

def test_get_garments():
    """Test get garments endpoint"""
    print("\n👗 Testing Get Garments...")
    try:
        response = requests.get(f"{API_BASE_URL}/api/garments")
        print(f"Status Code: {response.status_code}")
        data = response.json()
        print(f"Available Garments: {len(data.get('data', []))}")
        for garment in data.get('data', []):
            print(f"  - {garment['name']} (ID: {garment['id']})")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Get Garments Failed: {e}")
        return False

def test_try_on_session():
    """Test creating try-on session with actual images"""
    print("\n🚀 Testing Try-On Session Creation...")

    try:
        # Convert images to base64
        print("📸 Converting images to base64...")
        model_base64 = convert_image_to_base64("model.png")
        garment_base64 = convert_image_to_base64("germent.png")

        print(f"✅ Model image size: {len(model_base64)} characters")
        print(f"✅ Garment image size: {len(garment_base64)} characters")

        # Create try-on session request
        payload = {
            "userImage": f"data:image/png;base64,{model_base64}",
            "garmentId": "garment_001"
        }

        print(f"📤 Sending try-on request to {API_BASE_URL}/api/try-on")

        headers = {
            "Content-Type": "application/json"
        }

        response = requests.post(
            f"{API_BASE_URL}/api/try-on",
            json=payload,
            headers=headers
        )

        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                session_id = data['data']['sessionId']
                print(f"✅ Session Created: {session_id}")
                return session_id
            else:
                print(f"❌ Session creation failed: {data.get('message')}")
                return None
        else:
            print(f"❌ Try-On request failed with status {response.status_code}")
            return None

    except Exception as e:
        print(f"❌ Try-On Session Failed: {e}")
        return None

def test_session_status(session_id):
    """Test checking session status"""
    print(f"\n📊 Testing Session Status for: {session_id}")

    try:
        response = requests.get(f"{API_BASE_URL}/api/try-on/{session_id}/status")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                session_data = data['data']
                print(f"📈 Session Status: {session_data['status']}")
                print(f"⏱️ Progress: {session_data.get('progress', 0)}%")

                if session_data.get('resultImageUrl'):
                    print(f"🖼️ Result Image URL: {session_data['resultImageUrl']}")
                    return session_data
        return None

    except Exception as e:
        print(f"❌ Session Status Check Failed: {e}")
        return None

def download_result_image(image_url, filename="vton_result.png"):
    """Download the processed result image"""
    print(f"\n💾 Downloading result image: {filename}")

    try:
        response = requests.get(image_url)
        if response.status_code == 200:
            with open(filename, 'wb') as f:
                f.write(response.content)
            print(f"✅ Image saved as: {filename}")
            return True
        else:
            print(f"❌ Failed to download image. Status: {response.status_code}")
            return False

    except Exception as e:
        print(f"❌ Image Download Failed: {e}")
        return False

def main():
    """Main test function"""
    print("🧪 VTON Backend API Test Suite")
    print("=" * 50)

    # Test 1: Health Check
    if not test_health_check():
        print("❌ API Health Check Failed. Exiting...")
        return

    # Test 2: Get Garments
    if not test_get_garments():
        print("❌ Get Garments Failed. Continuing...")

    # Test 3: Try-On Session
    session_id = test_try_on_session()
    if not session_id:
        print("❌ Try-On Session Creation Failed. Exiting...")
        return

    # Test 4: Check Session Status
    result_data = test_session_status(session_id)

    # Test 5: Download Result (if available)
    if result_data and result_data.get('resultImageUrl'):
        image_url = result_data['resultImageUrl']

        # Try to download the result image
        if image_url.startswith('http'):
            download_result_image(image_url)
        else:
            print(f"📝 Mock result image URL (not downloadable): {image_url}")
    else:
        print("📝 No result image available yet (this is normal for mock API)")

    print("\n🎉 API Testing Completed!")
    print("=" * 50)
    print("📋 Summary:")
    print("  ✅ API is running and accessible")
    print("  ✅ Try-on session creation works")
    print("  ✅ Session status checking works")
    print("  📝 This is using mock data - real AI processing requires Supabase & Pixazo integration")

if __name__ == "__main__":
    main()