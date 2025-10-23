#!/usr/bin/env python3
"""
Real Image Testing for VTON Backend
Upload model.png and germent.png to Supabase, then test AI processing
"""

import requests
import base64
import json
import os
from datetime import datetime

BASE_URL = "https://vton-backend-8yg4xglbb-ancils-projects-f837529c.vercel.app"

def create_real_try_on_session():
    """Create try-on session with real images"""
    print("🎭 Creating Real Try-On Session with model.png and germent.png...")

    # Read and encode images
    def encode_image(filepath):
        with open(filepath, "rb") as f:
            image_data = f.read()
            return base64.b64encode(image_data).decode('utf-8')

    try:
        # Get garments first
        garments_response = requests.get(f"{BASE_URL}/api/garments")
        if garments_response.status_code != 200:
            print("❌ Failed to get garments")
            return

        garments = garments_response.json()['data']
        garment = garments[0] if garments else None

        if not garment:
            print("❌ No garments available")
            return

        print(f"   Using garment: {garment['name']} (ID: {garment['id']})")

        # Create payload with real images
        model_base64 = encode_image("model.png")
        garment_base64 = encode_image("germent.png")

        payload = {
            "userImage": f"data:image/png;base64,{model_base64}",
            "garmentId": garment['id'],
            "userId": "test-real-user-" + str(int(datetime.now().timestamp()))
        }

        print(f"   User image size: {len(model_base64)} characters")
        print(f"   Garment image size: {len(garment_base64)} characters")

        # Create session
        response = requests.post(
            f"{BASE_URL}/api/try-on",
            json=payload,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            session_id = data['data']['sessionId']
            print(f"✅ Session created: {session_id}")
            print(f"   Status: {data['data']['status']}")
            print(f"   Processing: {data['data'].get('processing', 'unknown')}")
            return session_id
        else:
            print(f"❌ Session creation failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None

    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def check_session_result(session_id):
    """Check session result"""
    if not session_id:
        return

    print(f"\n🔍 Checking session result...")

    try:
        response = requests.get(f"{BASE_URL}/api/try-on/{session_id}/status")

        if response.status_code == 200:
            data = response.json()
            session_data = data['data']

            print(f"   Status: {session_data['status']}")
            print(f"   Result URL: {session_data.get('resultImageUrl', 'None')}")
            print(f"   Error: {session_data.get('errorMessage', 'None')}")

            # Try to download result if available
            result_url = session_data.get('resultImageUrl')
            if result_url and 'mock-results.vton.ai' not in result_url:
                print(f"\n💾 Downloading real result...")
                download_response = requests.get(result_url, stream=True)

                if download_response.status_code == 200:
                    filename = f"real-result-{session_id[:8]}.png"
                    with open(filename, 'wb') as f:
                        for chunk in download_response.iter_content(chunk_size=8192):
                            f.write(chunk)

                    file_size = os.path.getsize(filename)
                    print(f"✅ Real result downloaded: {filename}")
                    print(f"   File size: {file_size:,} bytes")
                else:
                    print(f"❌ Download failed: {download_response.status_code}")
            else:
                print(f"⚠️ Using mock result (mock-results.vton.ai detected)")
        else:
            print(f"❌ Status check failed: {response.status_code}")

    except Exception as e:
        print(f"❌ Error checking result: {e}")

def test_supabase_direct():
    """Test direct Supabase connection"""
    print(f"\n🔌 Testing Supabase connection...")

    try:
        # Test if we can access Supabase storage directly
        test_url = "https://nujfrxpgljdfxodnwnem.supabase.co/storage/v1/object/public/vton-assets/garments/8c532593-713d-48b0-b03c-8cc337812f55/germent.jpg"
        response = requests.head(test_url)

        if response.status_code == 200:
            print(f"✅ Supabase storage accessible")
            print(f"   Garment image URL: {test_url}")
        else:
            print(f"❌ Supabase storage not accessible: {response.status_code}")

    except Exception as e:
        print(f"❌ Supabase connection error: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 Real Image Testing for VTON Backend")
    print("=" * 60)

    # Test Supabase connection
    test_supabase_direct()

    # Create real session
    session_id = create_real_try_on_session()

    # Check result
    check_session_result(session_id)

    print(f"\n🏁 Testing completed!")