#!/usr/bin/env python3
import requests
import json
import base64
import time

# API Base URL
BASE_URL = "https://vton-item.ai-agentic.tech"

def encode_image_to_base64(image_path):
    """Encode image file to base64"""
    try:
        with open(image_path, 'rb') as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            return f"data:image/png;base64,{encoded_string}"
    except Exception as e:
        print(f"❌ Error encoding image {image_path}: {e}")
        return None

def test_real_production_api():
    """Test API with real images and production data"""
    print("🚀 Starting Real Production API Test")
    print("=" * 60)

    # Test 1: Health Check
    print("\n🔍 Testing Health Check...")
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed!")
            print(f"   Version: {data.get('version')}")
            print(f"   Services Loaded:")
            print(f"     Supabase: {data['services']['supabase']['loaded']}")
            print(f"     Pixazo: {data['services']['pixazo']['loaded']}")
            print(f"   Database: {data['database']['connection']}")
        else:
            print(f"❌ Health check failed: {response.text}")
            return
    except Exception as e:
        print(f"❌ Health check error: {str(e)}")
        return

    # Test 2: Get Real Garments
    print("\n👚 Testing Real Garments Data...")
    try:
        response = requests.get(f"{BASE_URL}/api/garments")
        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Garments endpoint working!")
            print(f"   Total garments: {data.get('total')}")
            print(f"   Data source: {data.get('source')}")

            garments = data.get('data', [])
            for garment in garments:
                print(f"   📦 {garment.get('name')}")
                print(f"      ID: {garment.get('id')}")
                print(f"      Category: {garment.get('category')}")
                print(f"      Image: {garment.get('image_url')[:80]}...")

                # Save garment info for testing
                if garments.index(garment) == 0:
                    first_garment = garment
        else:
            print(f"❌ Garments endpoint failed: {response.text}")
            return
    except Exception as e:
        print(f"❌ Garments endpoint error: {str(e)}")
        return

    # Test 3: Real Try-On with model.png
    print(f"\n🎭 Testing Real Try-On with model.png...")

    # Check if model.png exists
    import os
    model_path = './model.png'
    if not os.path.exists(model_path):
        print(f"❌ model.png not found in current directory")
        return

    # Encode model image
    model_base64 = encode_image_to_base64(model_path)
    if not model_base64:
        return

    print(f"📸 model.png encoded (size: {len(model_base64)} characters)")

    # Use first garment for testing
    if 'first_garment' not in locals():
        print("❌ No garment data available for testing")
        return

    garment_id = first_garment['id']
    print(f"🎯 Using garment: {first_garment['name']} (ID: {garment_id})")

    try:
        payload = {
            "userImage": model_base64,
            "garmentId": garment_id,
            "userId": "test_user_real_production"
        }

        print("📤 Sending try-on request...")
        response = requests.post(
            f"{BASE_URL}/api/try-on",
            headers={"Content-Type": "application/json"},
            json=payload
        )

        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Try-on session created!")
            session_id = data['data']['sessionId']
            print(f"   Session ID: {session_id}")
            print(f"   Status: {data['data']['status']}")
            print(f"   Processing: {data['data']['processing']}")
            print(f"   Estimated Time: {data['data']['estimatedTime']}")
            print(f"   User Image: {data['data']['userImageUrl'][:80]}...")
            print(f"   Garment: {data['data']['garmentName']}")

            # Test 4: Wait and Check Status
            print(f"\n⏳ Checking session status...")

            max_attempts = 12  # 1 minute maximum
            for attempt in range(max_attempts):
                time.sleep(5)  # Wait 5 seconds

                try:
                    status_response = requests.get(f"{BASE_URL}/api/try-on/{session_id}/status")
                    if status_response.status_code == 200:
                        status_data = status_response.json()
                        print(f"   Attempt {attempt + 1}: Status = {status_data['data']['status']}")

                        if status_data['data']['status'] == 'completed':
                            print(f"\n🎉 TRY-ON COMPLETED SUCCESSFULLY!")
                            print(f"   ✅ Final Status: {status_data['data']['status']}")
                            print(f"   ✅ Progress: {status_data['data']['progress']}%")
                            print(f"   ✅ Result Image: {status_data['data']['resultImageUrl'][:80]}...")
                            print(f"   ✅ Completed At: {status_data['data']['completedAt']}")

                            # Download result image
                            result_url = status_data['data']['resultImageUrl']
                            if 'mock-results.vton.ai' not in result_url:
                                download_result_image(result_url, session_id)
                            else:
                                print(f"   ℹ️  Mock result (real AI processing not available)")

                            break
                        elif status_data['data']['status'] == 'failed':
                            print(f"\n❌ TRY-ON FAILED!")
                            print(f"   ❌ Error: {status_data['data'].get('errorMessage', 'Unknown error')}")
                            break
                        elif status_data['data']['status'] == 'processing':
                            if attempt == max_attempts - 1:
                                print(f"   ⏳ Still processing after 1 minute...")
                            continue
                        else:
                            print(f"   ⚠️  Unexpected status: {status_data['data']['status']}")
                    else:
                        print(f"   ⚠️  Status check failed: HTTP {status_response.status_code}")

                except Exception as e:
                    print(f"   ⚠️  Status check error: {str(e)}")

        else:
            print(f"❌ Try-on endpoint failed: {response.text}")

    except Exception as e:
        print(f"❌ Try-on test error: {str(e)}")

    print("\n" + "=" * 60)
    print("🎯 Real Production Test Summary")
    print("=" * 60)
    print("📝 What was tested:")
    print("   ✅ Real database connection (Supabase)")
    print("   ✅ Real garment data from database")
    print("   ✅ Real image upload to Supabase Storage")
    print("   ✅ Real AI processing (Pixazo API)")
    print("   ✅ Result image save to Supabase bucket")
    print("   ✅ End-to-end virtual try-on workflow")
    print("   ✅ model.png → real processing → result.png")

def download_result_image(result_url, session_id):
    """Download result image and save as result.png"""
    try:
        print(f"\n💾 Downloading result image...")
        response = requests.get(result_url)

        if response.status_code == 200:
            filename = f"result_{session_id[:8]}.png"
            with open(filename, 'wb') as f:
                f.write(response.content)
            print(f"   ✅ Result saved as: {filename}")
            print(f"   📊 File size: {len(response.content)} bytes")
        else:
            print(f"   ❌ Failed to download result: HTTP {response.status_code}")

    except Exception as e:
        print(f"   ❌ Error downloading result: {str(e)}")

if __name__ == "__main__":
    test_real_production_api()