import requests
import sys
import json
from datetime import datetime

class StreamVaultAPITester:
    def __init__(self, base_url="https://channel-cast.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.api_url}/")
            success = response.status_code == 200 and "StreamVault API" in response.json().get("message", "")
            self.log_test("API Root", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("API Root", False, str(e))
            return False

    def test_register_first_user(self):
        """Test user registration (first user becomes admin)"""
        try:
            test_username = f"admin_{datetime.now().strftime('%H%M%S')}"
            test_password = "TestPass123!"
            
            response = requests.post(f"{self.api_url}/auth/register", json={
                "username": test_username,
                "password": test_password
            })
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self.user_id = data.get("user", {}).get("id")
                is_admin = data.get("user", {}).get("is_admin", False)
                
                success = self.token and is_admin
                self.log_test("Register First User (Admin)", success, 
                            f"Admin: {is_admin}, Token: {'Yes' if self.token else 'No'}")
                return success
            else:
                self.log_test("Register First User (Admin)", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Register First User (Admin)", False, str(e))
            return False

    def test_login(self):
        """Test user login"""
        try:
            # Try to register a second user first
            test_username = f"user_{datetime.now().strftime('%H%M%S')}"
            test_password = "TestPass123!"
            
            # Register
            register_response = requests.post(f"{self.api_url}/auth/register", json={
                "username": test_username,
                "password": test_password
            })
            
            if register_response.status_code != 200:
                self.log_test("Login Test Setup", False, "Could not create test user")
                return False
            
            # Login
            login_response = requests.post(f"{self.api_url}/auth/login", json={
                "username": test_username,
                "password": test_password
            })
            
            success = login_response.status_code == 200 and "access_token" in login_response.json()
            self.log_test("User Login", success, f"Status: {login_response.status_code}")
            return success
        except Exception as e:
            self.log_test("User Login", False, str(e))
            return False

    def test_get_me(self):
        """Test get current user endpoint"""
        if not self.token:
            self.log_test("Get Current User", False, "No token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/auth/me", headers=headers)
            
            success = response.status_code == 200 and "username" in response.json()
            self.log_test("Get Current User", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Get Current User", False, str(e))
            return False

    def test_add_playlist(self):
        """Test adding a playlist"""
        if not self.token:
            self.log_test("Add Playlist", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            playlist_data = {
                "provider_name": "Test Provider",
                "m3u8_url": "https://iptv-org.github.io/iptv/countries/ad.m3u"
            }
            
            response = requests.post(f"{self.api_url}/playlists", 
                                   json=playlist_data, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                channel_count = data.get("channel_count", 0)
                success = channel_count > 0
                self.log_test("Add Playlist", success, 
                            f"Channels parsed: {channel_count}")
                return success, data.get("id")
            else:
                self.log_test("Add Playlist", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False, None
        except Exception as e:
            self.log_test("Add Playlist", False, str(e))
            return False, None

    def test_get_playlists(self):
        """Test getting all playlists"""
        if not self.token:
            self.log_test("Get Playlists", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/playlists", headers=headers)
            
            success = response.status_code == 200 and isinstance(response.json(), list)
            self.log_test("Get Playlists", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Get Playlists", False, str(e))
            return False

    def test_get_channels(self):
        """Test getting all channels (public endpoint)"""
        try:
            response = requests.get(f"{self.api_url}/channels")
            
            if response.status_code == 200:
                channels = response.json()
                success = isinstance(channels, list)
                self.log_test("Get Channels", success, 
                            f"Channels found: {len(channels) if success else 0}")
                return success
            else:
                self.log_test("Get Channels", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Get Channels", False, str(e))
            return False

    def test_get_providers(self):
        """Test getting all providers (public endpoint)"""
        try:
            response = requests.get(f"{self.api_url}/providers")
            
            if response.status_code == 200:
                providers = response.json()
                success = isinstance(providers, list)
                self.log_test("Get Providers", success, 
                            f"Providers found: {len(providers) if success else 0}")
                return success
            else:
                self.log_test("Get Providers", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Get Providers", False, str(e))
            return False

    def test_search_channels(self):
        """Test channel search functionality"""
        try:
            # Test search with query parameter
            response = requests.get(f"{self.api_url}/channels?search=tv")
            
            success = response.status_code == 200
            self.log_test("Search Channels", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Search Channels", False, str(e))
            return False

    def test_filter_by_provider(self):
        """Test filtering channels by provider"""
        try:
            # Test provider filter
            response = requests.get(f"{self.api_url}/channels?provider=Test Provider")
            
            success = response.status_code == 200
            self.log_test("Filter by Provider", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Filter by Provider", False, str(e))
            return False

    def test_refresh_playlist(self, playlist_id):
        """Test refreshing a playlist"""
        if not self.token or not playlist_id:
            self.log_test("Refresh Playlist", False, "No token or playlist ID")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.put(f"{self.api_url}/playlists/{playlist_id}/refresh", 
                                  headers=headers)
            
            success = response.status_code == 200
            self.log_test("Refresh Playlist", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Refresh Playlist", False, str(e))
            return False

    def test_delete_playlist(self, playlist_id):
        """Test deleting a playlist"""
        if not self.token or not playlist_id:
            self.log_test("Delete Playlist", False, "No token or playlist ID")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.delete(f"{self.api_url}/playlists/{playlist_id}", 
                                     headers=headers)
            
            success = response.status_code == 200
            self.log_test("Delete Playlist", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Delete Playlist", False, str(e))
            return False

    def test_unauthorized_access(self):
        """Test that admin endpoints require authentication"""
        try:
            # Try to access admin endpoint without token
            response = requests.get(f"{self.api_url}/playlists")
            
            success = response.status_code == 401
            self.log_test("Unauthorized Access Protection", success, 
                        f"Status: {response.status_code} (should be 401)")
            return success
        except Exception as e:
            self.log_test("Unauthorized Access Protection", False, str(e))
            return False

    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting StreamVault API Tests")
        print(f"📍 Testing: {self.base_url}")
        print("=" * 50)
        
        # Basic connectivity
        if not self.test_api_root():
            print("❌ API not accessible, stopping tests")
            return False
        
        # Authentication tests
        self.test_unauthorized_access()
        
        if not self.test_register_first_user():
            print("❌ Cannot register admin user, stopping tests")
            return False
        
        self.test_get_me()
        self.test_login()
        
        # Playlist management tests
        playlist_success, playlist_id = self.test_add_playlist()
        self.test_get_playlists()
        
        # Public endpoint tests
        self.test_get_channels()
        self.test_get_providers()
        self.test_search_channels()
        self.test_filter_by_provider()
        
        # Playlist operations (if we have a playlist)
        if playlist_id:
            self.test_refresh_playlist(playlist_id)
            self.test_delete_playlist(playlist_id)
        
        # Print summary
        print("=" * 50)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    tester = StreamVaultAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open("/app/test_reports/backend_test_results.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "total_tests": tester.tests_run,
            "passed_tests": tester.tests_passed,
            "success_rate": tester.tests_passed / tester.tests_run if tester.tests_run > 0 else 0,
            "results": tester.test_results
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())